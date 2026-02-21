# FFmpeg WASM setup (FLAC → ALAC for iPod)

Syncing FLAC tracks to an iPod requires transcoding to ALAC in the browser. The app uses [@ffmpeg/ffmpeg](https://github.com/ffmpegwasm/ffmpeg.wasm) and loads core assets from `public/ffmpeg/`.

## Required files in `public/ffmpeg/`

| File | Purpose |
|------|--------|
| `ffmpeg-core.js` | Core loader (UMD; used by the transcode worker) |
| `ffmpeg-core.wasm` | WebAssembly binary (~30 MB) |
| `ffmpeg-core.worker.js` | Optional; for multi-threaded use |

The transcode path uses `ffmpeg-core.js` and `ffmpeg-core.wasm` only. Next.js is configured to serve these with the correct MIME types so the worker can load them.

## Installing the assets

### Option 1: Copy from `@ffmpeg/core` (recommended)

1. Add the package (same major as `@ffmpeg/ffmpeg`):

   ```bash
   yarn add -D @ffmpeg/core@^0.12
   ```

2. Run the copy script:

   ```bash
   yarn copy-ffmpeg
   ```

   This copies `ffmpeg-core.js`, `ffmpeg-core.wasm`, and `ffmpeg-core.worker.js` from `node_modules/@ffmpeg/core/dist/umd/` (or `dist/esm/`) into `public/ffmpeg/`. The app’s transcode loader uses the UMD `ffmpeg-core.js`.

### Option 2: Download from CDN

From [unpkg](https://unpkg.com/browse/@ffmpeg/core@0.12.10/dist/umd/) or [jsDelivr](https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/), download:

- `ffmpeg-core.js`
- `ffmpeg-core.wasm`

into `public/ffmpeg/`.

## Verifying at runtime

- With the dev server (`yarn dev`), open the app and start an iPod sync that includes FLAC tracks. If assets are missing, the console will show: **"Failed to load ffmpeg core"** / **"FFmpeg not available; FLAC tracks will be skipped."**
- The app resolves the base URL from `window.location.origin` (and `assetPrefix` if set), so `public/ffmpeg/` is served at `/ffmpeg/`. No `basePath` or `assetPrefix` is required for local dev.

## Troubleshooting

- **"Cannot find module '…/ffmpeg-core.mjs'"**  
  The transcode loader was updated to use `ffmpeg-core.js` (UMD) so the worker can load it via `importScripts`. Ensure `public/ffmpeg/ffmpeg-core.js` exists and is the UMD build from `@ffmpeg/core`.

- **404 on `/ffmpeg/ffmpeg-core.js`**  
  Confirm the files are in `public/ffmpeg/` and restart the dev server. Next.js serves `public/` at the root.

- **CORS or MIME errors**  
  This app uses `output: 'export'` (static export), so there is no Next.js server and no custom headers in the build. The host serving the static files (e.g. GitHub Pages) uses its default MIME types; many hosts already serve `.js` and `.wasm` correctly. If FFmpeg fails to load, configure your host to serve `/ffmpeg/*.js` as `application/javascript` and `/ffmpeg/*.wasm` as `application/wasm`.
