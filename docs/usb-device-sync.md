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
