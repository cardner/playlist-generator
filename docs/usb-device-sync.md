# USB Device Playlist Sync

This app can write playlist files directly to USB music players that mount as
standard storage (mass storage/MSC). This includes many Sony Walkman models and
older iPods that appear as regular drives.

## What Works

- Writes M3U, PLS, or XSPF playlist files directly to a USB device folder.
- Uses the File System Access API (Chromium browsers).
- Stores device profiles so you can re-sync quickly.

## What Does Not Work

- Devices that use MTP/PTP only (common on phones and some Walkman models).
- iTunes-managed iPods (use the iTunes XML export instead).

## Recommended Settings

### Sony Walkman
- Format: M3U
- Playlist folder: `PLAYLISTS`
- Path strategy: Relative to playlist

### Generic USB Player
- Format: M3U (or PLS if required by the device)
- Playlist folder: `playlists`
- Path strategy: Relative to playlist

## Notes

- The device must already contain the music files in a matching folder structure.
- If tracks cannot be resolved to relative paths, the playlist may need manual
  relinking on the device.
