import sys
import unittest
import json
import tempfile
import subprocess
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from pathlib import Path

from starlette.requests import Request
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import main  # noqa: E402


def _request_with_query(raw_query: str) -> Request:
    scope = {
        "type": "http",
        "query_string": raw_query.encode("utf-8"),
        "headers": [],
    }
    return Request(scope)


class RawQueryParamTests(unittest.TestCase):
    """Reproduces and guards against the query bug that broke every Cloud-Server
    download: FastAPI/Starlette decode '+' in a query string as a space
    (x-www-form-urlencoded rule), which corrupts yt-dlp format selectors like
    'bestvideo+bestaudio' into 'bestvideo bestaudio'.
    """

    def test_literal_plus_is_preserved(self):
        request = _request_with_query("format_id=bestvideo%5Bheight%3C%3D720%5D+bestaudio")
        self.assertEqual(
            main._raw_query_param(request, "format_id"),
            "bestvideo[height<=720]+bestaudio",
        )

    def test_percent_encoded_plus_is_also_preserved(self):
        request = _request_with_query("format_id=bestvideo%2Bbestaudio")
        self.assertEqual(main._raw_query_param(request, "format_id"), "bestvideo+bestaudio")

    def test_missing_param_returns_none(self):
        request = _request_with_query("url=https://example.test")
        self.assertIsNone(main._raw_query_param(request, "format_id"))

    def test_reads_correct_param_among_several(self):
        request = _request_with_query("url=https://example.test/x&format_id=137%2Bbestaudio")
        self.assertEqual(main._raw_query_param(request, "url"), "https://example.test/x")
        self.assertEqual(main._raw_query_param(request, "format_id"), "137+bestaudio")


class ErrorClassificationTests(unittest.TestCase):
    def test_login_required_detected(self):
        exc = main.yt_dlp.utils.DownloadError(
            "ERROR: [Instagram] x: Instagram sent an empty media response. "
            "Check if this post is accessible in your browser without being logged-in."
        )
        self.assertEqual(main._classify_error(exc), "login_required")

    def test_forbidden_detected(self):
        exc = main.yt_dlp.utils.DownloadError("ERROR: HTTP Error 403: Forbidden")
        self.assertEqual(main._classify_error(exc), "forbidden_or_blocked")

    def test_rate_limited_detected(self):
        exc = main.yt_dlp.utils.DownloadError("ERROR: HTTP Error 429: Too Many Requests")
        self.assertEqual(main._classify_error(exc), "rate_limited")

    def test_unsupported_url_detected(self):
        exc = main.yt_dlp.utils.DownloadError("ERROR: Unsupported URL: ftp://example.test")
        self.assertEqual(main._classify_error(exc), "unsupported_url")

    def test_no_formats_found_detected(self):
        exc = main.yt_dlp.utils.DownloadError("ERROR: Requested format is not available")
        self.assertEqual(main._classify_error(exc), "no_formats_found")

    def test_generic_download_error_is_extractor_failed(self):
        exc = main.yt_dlp.utils.DownloadError("ERROR: [generic] some.site: unable to parse page")
        self.assertEqual(main._classify_error(exc), "extractor_failed")

    def test_non_downloaderror_is_unknown(self):
        self.assertEqual(main._classify_error(ValueError("boom")), "unknown_error")

    def test_status_and_message_exist_for_every_code(self):
        for code in main._ERROR_MESSAGES:
            self.assertIn(code, main._ERROR_STATUS)


class DownloadFormatSelectorTests(unittest.TestCase):
    def test_auto_builds_preference_chain(self):
        self.assertIn("bestaudio", main._download_format_selector("auto"))

    def test_simple_format_id_gets_audio_fallback(self):
        with patch.object(main, "FFMPEG_PATH", "ffmpeg"):
            selector = main._download_format_selector("137")
        self.assertTrue(selector.startswith("137[acodec!=?none]/"))
        self.assertIn("137+bestaudio[ext=m4a]", selector)
        self.assertNotIn("/best", selector)

    def test_complex_selector_passes_through_untouched(self):
        selector = "bestvideo[height<=720]+bestaudio/best"
        self.assertEqual(main._download_format_selector(selector), selector)

    def test_without_ffmpeg_auto_uses_combined_format(self):
        with patch.object(main, "FFMPEG_PATH", None):
            self.assertEqual(main._download_format_selector("auto"), "best[ext=mp4]/best")
            self.assertEqual(main._download_format_selector("18"), "18[acodec!=?none]")


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.patch = patch.object(main, "TMP_DIR", Path(self.temp.name) / "downloads")
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.client = TestClient(main.app)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def test_health_alias(self):
        self.assertEqual(self.client.get('/api/health').json()['status'], 'ok')

    def test_invalid_scheme_is_rejected_before_extraction(self):
        with patch.object(main, '_extract_info') as extract:
            response = self.client.post('/api/info', json={'url': 'file:///etc/passwd'})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()['error']['code'], 'unsupported_url')
        extract.assert_not_called()

    def test_missing_url_is_validation_error(self):
        self.assertEqual(self.client.post('/api/info', json={}).status_code, 422)

    def test_server_error_reaches_client(self):
        with patch.object(main, '_extract_info', side_effect=main.yt_dlp.utils.DownloadError('HTTP Error 403: Forbidden')):
            response = self.client.post('/api/info', json={'url': 'https://example.test/video'})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['error']['code'], 'forbidden_or_blocked')

    def test_failed_download_cleans_partial_files(self):
        def fail(url, options):
            Path(options['outtmpl'].replace('%(ext)s', 'mp4.part')).write_bytes(b'partial')
            raise main.yt_dlp.utils.DownloadError('HTTP Error 403: Forbidden')
        with patch.object(main, '_download_file', side_effect=fail):
            response = self.client.get('/api/download', params={'url': 'https://example.test/video'})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(list(main.TMP_DIR.iterdir()), [])

    def test_without_ffmpeg_hides_video_only_formats(self):
        formats = [
            {'format_id': 'silent', 'url': 'https://example.test/v', 'vcodec': 'avc1', 'acodec': 'none', 'height': 1080},
            {'format_id': 'combined', 'url': 'https://example.test/av', 'vcodec': 'avc1', 'acodec': 'mp4a', 'height': 720},
        ]
        with patch.object(main, 'FFMPEG_PATH', None):
            self.assertEqual([f['format_id'] for f in main._normalize_formats(formats)], ['combined'])

    def test_quality_prefers_h264_for_ios(self):
        formats = [
            {'format_id': 'h264', 'height': 720, 'vcodec': 'avc1', 'acodec': 'mp4a', 'ext': 'mp4', 'url': 'https://example.test/av'},
            {'format_id': 'av1', 'height': 720, 'vcodec': 'av01', 'acodec': 'opus', 'ext': 'webm', 'url': 'https://example.test/new'},
        ]
        self.assertEqual(main._normalize_formats(formats)[0]['format_id'], 'h264')

    def test_stream_uses_combined_format_instead_of_silent_video(self):
        formats = [
            {'format_id': 'silent', 'height': 1080, 'vcodec': 'avc1', 'acodec': 'none', 'url': 'https://example.test/silent'},
            {'format_id': 'combined', 'height': 360, 'vcodec': 'avc1', 'acodec': 'mp4a', 'url': 'https://example.test/combined'},
        ]
        with patch.object(main, '_extract_info', return_value={'formats': formats}):
            response = self.client.post('/api/stream', json={'url': 'https://example.test/video', 'format_id': 'silent'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['stream_url'], 'https://example.test/combined')

    def test_no_direct_stream_returns_error(self):
        with patch.object(main, '_extract_info', return_value={'formats': []}):
            response = self.client.post('/api/stream', json={'url': 'https://example.test/video', 'format_id': 'missing'})
        self.assertEqual(response.status_code, 404)

    @unittest.skipUnless(main.FFMPEG_PATH and main.FFPROBE_PATH, 'FFmpeg and ffprobe required')
    def test_real_extraction_download_audio_video_and_cleanup(self):
        source = Path(self.temp.name) / 'sample.mp4'
        subprocess.run([
            main.FFMPEG_PATH, '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10',
            '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
            '-t', '0.5', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', str(source),
        ], check=True, capture_output=True, timeout=30)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=self.temp.name))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f'http://127.0.0.1:{server.server_port}/sample.mp4'
            info = self.client.post('/api/info', json={'url': url})
            self.assertEqual(info.status_code, 200, info.text)
            format_id = info.json()['formats'][0]['format_id']
            # Both explicit quality and automatic selection must also work without FFmpeg.
            for ffmpeg in [main.FFMPEG_PATH, None]:
                for selection in [format_id, 'auto']:
                    with self.subTest(ffmpeg=bool(ffmpeg), selection=selection), patch.object(main, 'FFMPEG_PATH', ffmpeg):
                        result = self.client.get('/api/download', params={'url': url, 'format_id': selection})
                        self.assertEqual(result.status_code, 200, result.text[:200] if result.status_code != 200 else '')
                        self.assertEqual(result.content, source.read_bytes())
                        self.assertEqual(int(result.headers['content-length']), len(result.content))
                        self.assertEqual(list(main.TMP_DIR.iterdir()), [])
            downloaded = Path(self.temp.name) / 'downloaded.mp4'
            downloaded.write_bytes(result.content)
            probe = subprocess.run([main.FFPROBE_PATH, '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', str(downloaded)], capture_output=True, text=True, check=True)
            self.assertEqual({s['codec_type'] for s in json.loads(probe.stdout)['streams']}, {'audio', 'video'})
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
