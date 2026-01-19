# Progressive Web App (PWA)

This app can be installed as a Progressive Web App for a faster, more reliable
experience across desktop and mobile.

## Installability

- **Chrome/Edge (desktop + Android)**: the install prompt should appear once the
  app is served over HTTPS and the manifest + service worker are available.
- **iOS Safari**: use "Share" → "Add to Home Screen".

## Offline behavior

- The service worker caches the app shell, static assets, and the tempo worker.
- **IndexedDB remains the source of truth** for library metadata and saved playlists.
- Offline does not grant new access to local files; file handles still require
  user-granted permission and browser support.

## File access and permissions

- The **File System Access API** is supported in Chromium-based browsers only.
  iOS Safari does not support it.
- Directory handles are stored in IndexedDB, but access can be lost after
  a reboot or storage eviction.
- The app requests **persistent storage** (`navigator.storage.persist()`) to
  reduce eviction risk.
- If a handle becomes stale, the UI should prompt users to re-authorize or
  re-select the folder.

## Platform limitations

- **iOS**: No File System Access API, limited PWA caching behavior.
- **Private browsing**: Storage can be ephemeral and may clear between sessions.
- **GitHub Pages**: Service worker must be served at the site root to control
  all routes. If the app is hosted under a subpath, update `start_url`, `scope`,
  and service worker registration accordingly.

## Troubleshooting

- If playlists or scans disappear between sessions, check whether storage
  persistence was granted and re-open the installed app (not the browser tab).
- If file access fails, re-authorize folder access or re-import the library.
