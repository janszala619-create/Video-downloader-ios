import os
import re
import uuid
import asyncio
import shutil
import json
import logging
import subprocess
import time
from pathlib import Path
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler
from urllib.parse import urlparse, urlsplit, urlunsplit, unquote

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
import yt_dlp

TMP_DIR = Path("tmp_downloads")
LOG_DIR = Path(os.getenv("VIDSAVE_LOG_DIR", "logs"))
COOKIES_FILE = Path(os.getenv("VIDSAVE_COOKIES_FILE", "cookies.txt"))
FFMPEG_LOCATION = os.getenv("VIDSAVE_FFMPEG_LOCATION")
YTDLP_DEBUG = os.getenv("VIDSAVE_YTDLP_DEBUG", "").strip().lower() in {"1", "true", "yes"}
def _find_media_tool(name: str) -> str | None:
    if FFMPEG_LOCATION:
        location = Path(FFMPEG_LOCATION)
        directory = location if location.is_dir() else location.parent
        return shutil.which(name, path=str(directory))
    return shutil.which(name)


FFMPEG_PATH = _find_media_tool("ffmpeg")
FFPROBE_PATH = _find_media_tool("ffprobe")
VIDEO_EXTENSIONS = {".mp4", ".m4v", ".mov", ".webm", ".mkv"}
AUDIO_EXTENSIONS = {".m4a", ".mp3", ".aac", ".opus", ".ogg", ".weba", ".wav"}


def _configure_logging() -> tuple[logging.Logger, logging.Logger, logging.Logger]:
    LOG_DIR.mkdir(exist_ok=True)
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )

    def file_handler(filename: str) -> RotatingFileHandler:
        handler = RotatingFileHandler(
            LOG_DIR / filename,
            maxBytes=5 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        handler.setFormatter(formatter)
        return handler

    server = logging.getLogger("vidsave.server")
    access = logging.getLogger("vidsave.access")
    errors = logging.getLogger("vidsave.error")
    for logger, filename in (
        (server, "server.log"),
        (access, "access.log"),
        (errors, "error.log"),
    ):
        logger.setLevel(logging.INFO)
        logger.propagate = False
        if not logger.handlers:
            logger.addHandler(file_handler(filename))
    return server, access, errors


server_log, access_log, error_log = _configure_logging()

if not FFMPEG_PATH:
    server_log.warning("ffmpeg_not_found: Video+Audio-Zusammenfuehrung wird fehlschlagen (VIDSAVE_FFMPEG_LOCATION setzen falls ffmpeg installiert, aber nicht im PATH ist).")


@asynccontextmanager
async def lifespan(app: FastAPI):
    TMP_DIR.mkdir(exist_ok=True)
    server_log.info(
        "VidSave backend started yt_dlp=%s ffmpeg=%s ffprobe=%s cookies_file=%s",
        yt_dlp.version.__version__,
        FFMPEG_PATH or "missing",
        FFPROBE_PATH or "missing",
        COOKIES_FILE if COOKIES_FILE.exists() else "not configured",
    )
    yield
    server_log.info("VidSave backend stopped")
    shutil.rmtree(TMP_DIR, ignore_errors=True)
    TMP_DIR.mkdir(exist_ok=True)


app = FastAPI(title="VidSave API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        error_log.exception(
            "request_failed method=%s path=%s client=%s elapsed_ms=%s",
            request.method,
            request.url.path,
            request.client.host if request.client else "-",
            elapsed_ms,
        )
        raise

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    access_log.info(
        "method=%s path=%s status=%s client=%s elapsed_ms=%s",
        request.method,
        request.url.path,
        response.status_code,
        request.client.host if request.client else "-",
        elapsed_ms,
    )
    return response


class InfoRequest(BaseModel):
    url: str


class StreamRequest(BaseModel):
    url: str
    format_id: str


# ---------------------------------------------------------------------------
# URL/query helpers
# ---------------------------------------------------------------------------

def _raw_query_param(request: Request, name: str) -> str | None:
    """Read a query parameter straight from the raw query string.

    FastAPI/Starlette decode query values with ``parse_qsl`` semantics, which
    turns a literal ``+`` into a space (the classic x-www-form-urlencoded
    rule). yt-dlp format selectors legitimately contain ``+`` (e.g.
    ``137+bestaudio``) but never contain literal spaces, so that decoding
    silently corrupts the selector and downloads end up with no audio track.
    Re-parse the raw bytes and only unescape %XX sequences, leaving ``+``
    untouched, so a value the client sent as ``bestvideo+bestaudio`` arrives
    intact instead of as ``bestvideo bestaudio``.
    """
    raw = request.scope.get("query_string", b"").decode("utf-8", "replace")
    for part in raw.split("&"):
        key, _, value = part.partition("=")
        if unquote(key, errors="replace") == name:
            return unquote(value, errors="replace")
    return None


def _normalize_url(url: str) -> str:
    normalized = url.strip()
    if not normalized:
        raise ValueError("URL is required")
    if not urlparse(normalized).scheme:
        normalized = f"https://{normalized}"
    parts = urlsplit(normalized)
    if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password:
        raise ValueError("Unsupported URL: enter an HTTP or HTTPS video link")
    return normalized


def _safe_url(url: str, max_length: int = 160) -> str:
    parts = urlsplit(url)
    safe = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    if len(safe) > max_length:
        return safe[: max_length - 3] + "..."
    return safe


def _sanitize_log_text(text: str) -> str:
    return re.sub(r"https?://[^\s)]+", lambda match: _safe_url(match.group(0)), text)


# ---------------------------------------------------------------------------
# yt-dlp options
# ---------------------------------------------------------------------------

def _http_headers(url: str) -> dict[str, str]:
    parts = urlsplit(url)
    origin = urlunsplit((parts.scheme, parts.netloc, "/", "", "")) if parts.scheme and parts.netloc else ""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 "
            "Mobile/15E148 Safari/604.1"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }
    if origin:
        headers["Referer"] = origin
    return headers


class _YtdlpLogger:
    def debug(self, message):
        server_log.debug("yt_dlp %s", _sanitize_log_text(str(message)))

    def warning(self, message):
        server_log.warning("yt_dlp %s", _sanitize_log_text(str(message)))

    def error(self, message):
        error_log.error("yt_dlp %s", _sanitize_log_text(str(message)))


def _ydl_base_opts(url: str) -> dict:
    opts = {
        "quiet": not YTDLP_DEBUG,
        "no_warnings": not YTDLP_DEBUG,
        "logger": _YtdlpLogger(),
        "http_headers": _http_headers(url),
        "noplaylist": True,
        "js_runtimes": {"deno": {}, "node": {}},
        "socket_timeout": 30,
        "retries": 5,
        "fragment_retries": 5,
        "extractor_retries": 3,
        "file_access_retries": 3,
    }
    if FFMPEG_LOCATION:
        opts["ffmpeg_location"] = FFMPEG_LOCATION
    if COOKIES_FILE.exists():
        opts["cookiefile"] = str(COOKIES_FILE)
    return opts


def _download_format_selector(format_id: str) -> str:
    if format_id == "auto":
        if not FFMPEG_PATH:
            return "best[ext=mp4]/best"
        return "/".join([
            "bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[acodec^=mp4a][ext=m4a]",
            "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]",
            "best[vcodec^=avc1][acodec^=mp4a][ext=mp4]",
            "best[vcodec!=none][acodec!=none][ext=mp4]",
            "bestvideo+bestaudio/best",
        ])
    if "+" in format_id or "/" in format_id:
        return format_id
    if not FFMPEG_PATH:
        return f"{format_id}[acodec!=?none]"
    return f"{format_id}[acodec!=?none]/{format_id}+bestaudio[ext=m4a]/{format_id}+bestaudio/{format_id}"


def _has_video_track(path: Path) -> bool:
    if path.suffix.lower() in AUDIO_EXTENSIONS:
        return False
    if FFPROBE_PATH:
        try:
            result = subprocess.run(
                [
                    FFPROBE_PATH,
                    "-v",
                    "error",
                    "-show_entries",
                    "stream=codec_type",
                    "-of",
                    "json",
                    str(path),
                ],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            if result.returncode == 0:
                data = json.loads(result.stdout or "{}")
                return any(
                    stream.get("codec_type") == "video"
                    for stream in data.get("streams", [])
                )
        except Exception as exc:
            server_log.warning("ffprobe_failed path=%s exception_type=%s", path, type(exc).__name__)
    return path.suffix.lower() in VIDEO_EXTENSIONS


def _extract_info(url: str) -> dict:
    with yt_dlp.YoutubeDL(_ydl_base_opts(url) | {"skip_download": True}) as ydl:
        return ydl.extract_info(url, download=False)


def _normalize_formats(formats: list) -> list:
    seen: set[str] = set()
    result = []
    preferred = sorted(formats, key=lambda f: (
        f.get("height") or 0,
        str(f.get("vcodec", "")).startswith(("avc1", "h264")) and f.get("ext") == "mp4",
        f.get("acodec") not in {None, "none"},
    ), reverse=True)
    for f in preferred:
        if f.get("vcodec") == "none" or f.get("has_drm"):
            continue
        if f.get("acodec") == "none" and not FFMPEG_PATH:
            continue
        if not f.get("url"):
            continue
        format_id = f.get("format_id") or f.get("format_note") or "best"
        height = f.get("height")
        label = f"{height}p" if height else f.get("format_note") or format_id
        if label in seen:
            continue
        seen.add(label)
        result.append({
            "format_id": format_id,
            "formatId": format_id,
            "id": format_id,
            "quality": label,
            "label": label,
            "ext": "mp4" if f.get("acodec") == "none" else f.get("ext", "mp4"),
            "filesize": f.get("filesize") or f.get("filesize_approx"),
            "fileSize": f.get("filesize") or f.get("filesize_approx"),
        })
    return result


def _download_file(url: str, ydl_opts: dict) -> None:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if not info or info.get("_type") in {"playlist", "multi_video"}:
            raise NoFormatsFoundError("Please use a link to a single video")
        if info.get("requested_formats") and not FFMPEG_PATH:
            raise RuntimeError("ffmpeg is not installed, cannot merge requested formats")
        ydl.process_ie_result(info, download=True)


async def _file_iterator(path: Path, chunk_size: int = 65536):
    with open(path, "rb") as f:
        while chunk := f.read(chunk_size):
            yield chunk


# ---------------------------------------------------------------------------
# Error classification (Aufgabe 5/8: keine pauschale "Link ungueltig")
# ---------------------------------------------------------------------------

_ERROR_RULES: list[tuple[str, re.Pattern]] = [
    ("ffmpeg_missing", re.compile(r"ffmpeg (not found|is not installed)|ffprobe (not found|is not installed)", re.I)),
    ("login_required", re.compile(r"sign in|log ?in to confirm|logged.?in|private video|requires? authentication|this video is only available (for|to)|premieres in|empty media response", re.I)),
    ("login_required", re.compile(r"cookies?[^.]*(required|needed|provide|for the authentication)", re.I)),
    ("forbidden_or_blocked", re.compile(r"\b403\b|forbidden|not a bot|captcha|verify you.?re human|access denied", re.I)),
    ("rate_limited", re.compile(r"\b429\b|too many requests|rate.?limit", re.I)),
    ("timeout", re.compile(r"timed? ?out|read timed out|connection timeout", re.I)),
    ("unsupported_url", re.compile(r"unsupported url|is not a valid url|no extractor|unable to extract", re.I)),
    ("no_formats_found", re.compile(r"no video formats|requested format is not available|no formats found|no such format", re.I)),
]

_ERROR_MESSAGES: dict[str, str] = {
    "unsupported_url": "Dieser Link wird nicht unterstuetzt.",
    "extractor_failed": "Der Link konnte nicht ausgelesen werden (Seite hat sich evtl. geaendert oder das Video wurde entfernt).",
    "login_required": "Diese Seite benoetigt Login/Cookies oder blockiert Server-Anfragen.",
    "forbidden_or_blocked": "Diese Seite blockiert Server-Anfragen oder benoetigt Cookies/Login.",
    "rate_limited": "Zu viele Anfragen an diese Seite. Bitte spaeter erneut versuchen.",
    "ffmpeg_missing": "Der Server kann Video und Ton nicht zusammenfuegen (ffmpeg fehlt auf dem Server).",
    "timeout": "Zeitueberschreitung beim Abrufen des Videos.",
    "no_formats_found": "Fuer diesen Link wurden keine herunterladbaren Formate gefunden.",
    "unknown_error": "Unbekannter Fehler beim Verarbeiten des Links.",
}

_ERROR_STATUS: dict[str, int] = {
    "unsupported_url": 422,
    "extractor_failed": 422,
    "login_required": 403,
    "forbidden_or_blocked": 403,
    "rate_limited": 429,
    "ffmpeg_missing": 500,
    "timeout": 504,
    "no_formats_found": 422,
    "unknown_error": 500,
}

_EXTRACTOR_HINT = re.compile(r"\[([A-Za-z0-9_:.-]+)\]")


class NoFormatsFoundError(Exception):
    pass


def _classify_error(exc: Exception) -> str:
    if isinstance(exc, NoFormatsFoundError):
        return "no_formats_found"
    if not FFMPEG_PATH and isinstance(exc, yt_dlp.utils.DownloadError) and "merg" in str(exc).lower():
        return "ffmpeg_missing"
    message = str(exc)
    for code, pattern in _ERROR_RULES:
        if pattern.search(message):
            return code
    if isinstance(exc, yt_dlp.utils.DownloadError):
        return "extractor_failed"
    return "unknown_error"


def _guess_extractor(message: str) -> str | None:
    match = _EXTRACTOR_HINT.search(message)
    return match.group(1) if match else None


def _error_response(request_id: str, phase: str, url: str, exc: Exception) -> JSONResponse:
    code = _classify_error(exc)
    status = _ERROR_STATUS[code]
    message = _ERROR_MESSAGES[code]
    detail = _sanitize_log_text(str(exc))
    extractor = _guess_extractor(str(exc))
    error_log.error(
        "%s_failed request_id=%s url=%s phase=%s code=%s exception_type=%s extractor=%s message=%s",
        phase,
        request_id,
        _safe_url(url),
        phase,
        code,
        type(exc).__name__,
        extractor or "unknown",
        detail,
    )
    body = {
        # Top-level "detail" kept for the existing web frontend (frontend/src/services/api.ts),
        # "error" is the structured shape the iOS app's ServerErrorDTO decodes.
        "detail": message,
        "error": {
            "code": code,
            "message": message,
            "phase": phase,
            "request_id": request_id,
            "exception_type": type(exc).__name__,
            "detail": detail,
        },
    }
    return JSONResponse(status_code=status, content=body)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

async def _video_info_response(url: str, request_id: str):
    try:
        normalized_url = _normalize_url(url)
        server_log.info("info_requested request_id=%s url=%s", request_id, _safe_url(normalized_url))
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, _extract_info, normalized_url)
        formats = _normalize_formats(info.get("formats", []))
        if not formats:
            raise NoFormatsFoundError("no video formats found")
    except Exception as e:
        return _error_response(request_id, "info", url, e)

    server_log.info(
        "info_ok request_id=%s url=%s title=%s formats=%s",
        request_id,
        _safe_url(normalized_url),
        info.get("title", "Unknown"),
        len(formats),
    )
    return {
        "title": info.get("title", "Unknown"),
        "thumbnail": info.get("thumbnail", ""),
        "duration": info.get("duration", 0),
        "formats": formats,
        "url": normalized_url,
    }


@app.get("/info")
@app.get("/api/info")
async def get_info_query(request: Request, url: str = Query(...)):
    raw_url = _raw_query_param(request, "url")
    request_id = uuid.uuid4().hex[:12]
    return await _video_info_response(raw_url if raw_url is not None else url, request_id)


@app.post("/info")
@app.post("/api/info")
async def get_info(req: InfoRequest):
    request_id = uuid.uuid4().hex[:12]
    return await _video_info_response(req.url, request_id)


@app.get("/download")
@app.get("/api/download")
async def download_video(
    request: Request,
    background_tasks: BackgroundTasks,
    url: str = Query(...),
    format_id: str = Query("auto"),
):
    request_id = uuid.uuid4().hex[:12]
    raw_url = _raw_query_param(request, "url")
    raw_format_id = _raw_query_param(request, "format_id")
    url = raw_url if raw_url is not None else url
    format_id = raw_format_id if raw_format_id is not None else format_id

    file_id = uuid.uuid4().hex
    try:
        normalized_url = _normalize_url(url)
        selector = _download_format_selector(format_id)
        server_log.info(
            "download_requested request_id=%s url=%s format_id=%s selector=%s",
            request_id,
            _safe_url(normalized_url),
            format_id,
            selector,
        )

        out_template = str(TMP_DIR / f"{file_id}.%(ext)s")
        ydl_opts = {
            **_ydl_base_opts(normalized_url),
            "format": selector,
            "merge_output_format": "mp4",
            "outtmpl": out_template,
        }

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _download_file, normalized_url, ydl_opts)

        matches = list(TMP_DIR.glob(f"{file_id}.*"))
        if not matches:
            raise RuntimeError("yt-dlp produced no output file")

        video_matches = []
        for path in matches:
            if await asyncio.to_thread(_has_video_track, path):
                video_matches.append(path)
        if not video_matches:
            for path in matches:
                path.unlink(missing_ok=True)
            raise RuntimeError(
                "yt-dlp did not produce a playable video track "
                "(format had no video stream, or ffmpeg failed to merge it)"
            )
    except Exception as e:
        for leftover in TMP_DIR.glob(f"{file_id}.*"):
            leftover.unlink(missing_ok=True)
        return _error_response(request_id, "download", url, e)

    filepath = max(video_matches, key=lambda path: path.stat().st_size)
    ext = filepath.suffix.lstrip(".")
    media_type = "video/mp4" if ext == "mp4" else "application/octet-stream"
    file_size = filepath.stat().st_size

    safe_title = file_id
    filename = f"vidsave_{safe_title}.{ext}"

    for path in matches:
        background_tasks.add_task(path.unlink, missing_ok=True)
    server_log.info(
        "download_ok request_id=%s url=%s format_id=%s file=%s size=%s",
        request_id,
        _safe_url(normalized_url),
        format_id,
        filepath.name,
        file_size,
    )

    return StreamingResponse(
        _file_iterator(filepath),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(file_size),
        },
    )


@app.post("/stream")
@app.post("/api/stream")
async def get_stream_url(req: StreamRequest):
    request_id = uuid.uuid4().hex[:12]
    loop = asyncio.get_event_loop()
    try:
        info = await loop.run_in_executor(None, _extract_info, _normalize_url(req.url))
    except Exception as e:
        return _error_response(request_id, "stream", req.url, e)

    formats = info.get("formats", [])
    selected = next((f for f in formats if f.get("format_id") == req.format_id), None)
    if selected:
        if selected.get("url") and selected.get("acodec") != "none" and selected.get("vcodec") != "none":
            return {"stream_url": selected["url"]}
        # A direct video-only URL cannot play the separately downloaded audio.
        combined = [f for f in formats if f.get("url") and f.get("acodec") not in {None, "none"}
                    and f.get("vcodec") not in {None, "none"}
                    and (f.get("height") or 0) <= (selected.get("height") or 0)]
        if combined:
            playable = max(combined, key=lambda f: (f.get("height") or 0,
                str(f.get("vcodec", "")).startswith(("avc1", "h264"))))
            return {"stream_url": playable["url"]}

    raise HTTPException(status_code=404, detail="Format not found or no direct URL available")


@app.get("/api/health")
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "yt_dlp": yt_dlp.version.__version__,
        "ffmpeg": bool(FFMPEG_PATH),
        "ffprobe": bool(FFPROBE_PATH),
        "cookies_configured": COOKIES_FILE.exists(),
    }
