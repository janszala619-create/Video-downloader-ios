import sys
import unittest
from pathlib import Path

from starlette.requests import Request

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
        self.assertEqual(main._download_format_selector("137"), "137+bestaudio/137/best")

    def test_complex_selector_passes_through_untouched(self):
        selector = "bestvideo[height<=720]+bestaudio/best"
        self.assertEqual(main._download_format_selector(selector), selector)


if __name__ == "__main__":
    unittest.main()
