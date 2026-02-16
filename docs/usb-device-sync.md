# USB Device Playlist Sync

This app can write playlist files directly to USB music players that mount as
standard storage (mass storage/MSC). This includes many Sony Walkman models and
older iPods that appear as regular drives.

## What Works

- Writes M3U, PLS, or XSPF playlist files directly to a USB device folder.
- Uses the File System Access API (Chromium browsers).
- Stores device profiles so you can re-sync quickly.
- Supports device path detection by scanning the device for matching files.

## What Does Not Work

- Devices that use MTP/PTP only (common on phones and some Walkman models).
- iPods without iTunesDB access or with unsupported encryption (older/newer models may vary).
- Some Microsoft Zune devices that present as MTP-only without a companion app.

## Recommended Settings

### Jellyfin (Docker)

- Use **Add Jellyfin Export** on the Device Sync page to create a profile.
- Export destination:
  - **Download M3U**: uses absolute container paths (requires container prefix).
  - **Save to Library Root**: writes M3U into the library root with relative paths.
- Container prefix example: `/media/music`

### Sony Walkman

- Format: M3U (UTF-8)
- Playlist folder: `MUSIC`
- Path strategy: Relative to playlist
- Paths must be relative to `MUSIC/` with exact casing and spacing.
- Avoid `./`, `../`, and URL-encoded characters.
- Tip: Use **Detect Walkman** or the **Add Walkman Preset** card on the Device Sync page.

### Generic USB Player

- Format: M3U (or PLS if required by the device)
- Playlist folder: `playlists`
- Path strategy: Relative to playlist

### Microsoft Zune (Experimental)

- Format: M3U
- Playlist folder: `playlists`
- Path strategy: Relative to playlist
- Note: Zune devices may require a companion app if they only support MTP.

### Apple iPod (iTunesDB In-Browser)

- Uses libgpod compiled to WebAssembly to read/write `iTunesDB` in-browser.
- Requires a Chromium browser with File System Access API + WebUSB.
- One-time SysInfo setup may be required (FirewireGuid + ModelNumStr).
- Place `ipod_manager.js` + `.wasm` under `public/ipod/`.
- FLAC uploads require `ffmpeg.wasm` assets under `public/ffmpeg/` and
  hosting headers to enable `SharedArrayBuffer` (COOP/COEP).

**Matching existing tracks:** To avoid duplicating files, the app tries to match each playlist track to a track already on the device. Order: saved mapping from a previous sync, then AcoustID (if present in file metadata), then content hash, then tag+size and tag+duration. When a match is found, the playlist is updated to reference that device track; when not, the file is copied and a mapping is stored for next time. Tracks with AcoustID in their tags (e.g. from MusicBrainz Picard) match across transcodes (e.g. FLAC vs ALAC).

**Missing-tracks prompt:** If some playlist tracks are not on the device, a dialog appears before sync: you can **Sync missing** (copy them), **Playlist only** (update the playlist to reference only tracks already on the device), or **Cancel**.

**Album art:** When syncing new tracks to an iPod, the app can sync album artwork via ArtworkDB/ITHMB if your library files have embedded cover art (e.g. ID3 or MP4 tags). Artwork is extracted from the source file, resized to an iPod-compatible thumbnail (e.g. 300–600px JPEG), and written to the device’s `iPod_Control/Artwork` folder. This requires the iPod WASM build to expose the artwork API (see `docs/ipod-wasm-artwork.md`). Known limits: some classic iPods (e.g. 5th gen with 32 MB RAM) may not display art when the library exceeds roughly 20k tracks; use compatible resolutions (e.g. 300×300–600×600 JPEG) for best results.

## Notes

- For iPod sync, the app writes audio files directly to `/iPod_Control/Music/F##`.
- The device must already contain the music files in a matching folder structure
  when using playlist file sync (non-iPod devices).
- If tracks cannot be resolved to relative paths, the playlist may need manual
  relinking on the device.
- Path detection can scan specific folders (e.g. `MUSIC`, `MP3`) to improve accuracy.
- Jellyfin in Docker requires container paths, not host paths.

## Auto-Detect Testing Checklist

- Load `/device-sync` with saved device handles and confirm status resolves without clicks.
- Click **Detect Device** and verify the permission prompt appears and a device card is added.
- Revoke permission (or remove device) and confirm status shows **Needs access** or **Missing**.
- Use **Reconnect** to rebind the device and verify status returns to **Available**.
- Sync one playlist and then multiple playlists in sequence; verify progress updates.
