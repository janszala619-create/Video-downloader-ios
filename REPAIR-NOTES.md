# Download repair

The application uses the React/Capacitor frontend in `frontend` and the FastAPI/yt-dlp server in `backend`.

## Changes

- Wait for successful transfers before adding download history; show server errors.
- Save iOS downloads to Documents using Capacitor Filesystem and play them locally from history.
- Add server configuration and a health check; use native HTTP for iOS requests to local/Tailscale servers.
- Enable local networking without disabling transport security for all web content.
- Preserve combined video/audio formats without requiring FFmpeg; merge separate tracks when needed.
- Prefer H.264 for equal quality and avoid silent video-only preview URLs.
- Update yt-dlp to 2026.8.19, install its EJS companion, and enable Node/Deno runtimes.
- Make player controls reachable above the play overlay and surface playback failures.

## Running and building

Install `backend/requirements.txt` with Python. Install FFmpeg (including ffprobe) and Node 22+ or Deno 2.3+. Start the backend with `python -m uvicorn main:app --host 0.0.0.0 --port 8765` from `backend`.

In `frontend`, run `npm ci`, `npm test`, and `npm run build`. For development, `npm run dev` proxies `/api` to port 8000; alternatively enter the running server's address in **Server settings**. On iPhone, enter `http://100.80.105.62:8765` and connect Tailscale. Use **Save and test connection**.

On macOS, run `npm run sync` and build the `App` workspace in Xcode. Alternatively run the GitHub Actions iOS workflow on the repair branch. Set `api_url` to the server address to preconfigure it. An unsigned IPA requires signing/sideloading before installation.

## Verification

- Backend: 26 passing tests via `python -m unittest discover -s tests -v` from `backend`. Includes real yt-dlp downloads of an HTTP-served generated MP4, explicit/automatic formats with and without FFmpeg, byte equality, audio/video verification with ffprobe, and temporary-file cleanup.
- Frontend: 17 passing tests via `npm test` cover server communication, file transfer, errors, history timing, duplicate download prevention, native filesystem calls, and player controls. Native APIs are mocked.
- `npm run build` checks TypeScript and produces the web bundle.
- Live checks on 2026-09-10: MP4 downloads through the user's Tailscale server succeeded (788,493 bytes each). A YouTube download with the updated extractor succeeded in the isolated test process (5,571,481 bytes, H.264 + AAC).
- Browser checks: server connection, video analysis, quality selection, download completion, persisted history, full 10-second playback, and removing the generated test history entry.

## Limitations

The latest EJS/runtime changes and extractor update need a restart of the running server. Windows denied restarting the now-administrator-owned process. Earlier backend fixes were already restarted successfully; existing server edits were preserved. Original backend files are backed up locally in the ignored `repair-backup` folder.

Native iPhone execution requires an installed new build and must still be checked on the device; Windows cannot run Xcode or an iOS simulator. Downloads requiring site login/cookies remain subject to that site's access requirements. Browser downloads buffer the video in memory; native downloads stream directly to disk.

The dependency audit still reports issues in the existing Capacitor 6 CLI, Vite 5 and React Router 6 dependency trees. Compatible updates were applied; major framework upgrades are separate work.

## References

- [Capacitor 6 Filesystem](https://capacitorjs.com/docs/v6/apis/filesystem): Documents storage, iOS Files visibility and privacy manifest.
- [Apple local networking](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking): local-network transport settings.
- [yt-dlp EJS setup](https://github.com/yt-dlp/yt-dlp/wiki/EJS): runtime and companion package requirements.
