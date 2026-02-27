# iPod WASM: ArtworkDB / album art support

**Note:** The app now has a **pure TypeScript iPod backend** (`USE_IPOD_TS_BACKEND`). When enabled, iTunesDB, device info, path conversion, and artwork (setTrackArtwork / writeArtwork) are implemented in TS with no WASM. The WASM path below applies when the TS backend is disabled or when using the prebuilt `ipod_manager` module.

The prebuilt iPod WASM (`public/ipod/ipod_manager.js` + `.wasm`) is produced from a C build that wraps libgpod. This repo uses artifacts from [TunesReloaded](https://github.com/rish1p/tunesreloaded) (or a compatible build), which includes artwork support. At runtime, if the module does not export the artwork APIs, the app installs no-op stubs so sync continues without artwork.

## Artwork exports (TunesReloaded / libgpod-wasm)

The app prefers these exports when present:

1. **`ipod_track_set_artwork_from_data`** (Emscripten: `_ipod_track_set_artwork_from_data`)
   - **Signature (C):** `int ipod_track_set_artwork_from_data(int track_index, const unsigned char *image_data, unsigned int image_data_len)`
   - Sets a track’s artwork from raw image bytes (JPEG or PNG). Uses libgpod’s `itdb_track_set_thumbnails_from_data()`. Return `0` on success, `-1` on error (use `ipod_get_last_error()` for details).

2. **`ipod_device_supports_artwork`** (Emscripten: `_ipod_device_supports_artwork`)
   - **Signature (C):** `int ipod_device_supports_artwork(void)`
   - Call **after** `ipod_parse_db()`. Returns `1` if the parsed device supports artwork, `0` otherwise. Uses libgpod’s `itdb_device_supports_artwork(g_itdb->device)`.

The TypeScript layer in `src/features/devices/ipod/wasm.ts` calls `wasmSetTrackArtwork(trackIndex, jpegBytes)`, which tries `_ipod_track_set_artwork_from_data` first, then falls back to `_ipod_set_track_artwork` for older builds. It uses `wasmDeviceSupportsArtwork()` (after parse) when on the WASM backend to decide whether to sync artwork; if that export is missing, the app falls back to the product-ID table in `firewire-setup.ts`.

## Legacy: ipod_set_track_artwork

Older builds may expose only:

- **Name:** `ipod_set_track_artwork`
- **Signature (C):** `int ipod_set_track_artwork(int track_index, const uint8_t* jpeg_data, int jpeg_len)`

The app still supports this for backward compatibility when `ipod_track_set_artwork_from_data` is not present.

## itdb_write and ArtworkDB

When the app calls `ipod_write_db`, the C side must call libgpod’s **`itdb_write()`** (or equivalent) so that it writes:

1. **iTunesDB** (and optionally iTunesSD) to `iPod_Control/iTunes/`
2. **ArtworkDB** and **ITHMB** files to `iPod_Control/Artwork/`

libgpod’s `itdb_write()` normally writes both when thumbnails have been set. Ensure the virtual filesystem mountpoint used for `iPod_Control` includes the Artwork directory and that the build is linked with libgpod’s ArtworkDB/ITHMB support.

## Optional: parse ArtworkDB on load

When parsing an existing iPod (e.g. `ipod_parse_db`), the C side may optionally parse **ArtworkDB** from `iPod_Control/Artwork/ArtworkDB` so existing thumbnails are preserved and not clobbered on re-sync. The app’s `syncIpodToVirtualFS` will copy the device’s Artwork folder into the virtual FS before parse when this is implemented.
