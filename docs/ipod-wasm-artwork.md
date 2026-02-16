# iPod WASM: ArtworkDB / album art support

The prebuilt iPod WASM (`public/ipod/ipod_manager.js` + `.wasm`) is produced from a C build that wraps libgpod. This repo does not contain that C source. At runtime, if the module does not export `_ipod_set_track_artwork`, the app installs a no-op stub that returns -1 so the interface is always present and sync continues without artwork. To enable **album art sync** (ArtworkDB + ITHMB), the WASM must be rebuilt from C with the artwork API and the new artifacts placed under `public/ipod/`.

## Required C API

Expose a function callable from JavaScript that attaches JPEG thumbnail data to a track in the in-memory iTunesDB:

- **Name:** `ipod_set_track_artwork`
- **Signature (C):** `int ipod_set_track_artwork(int track_index, const uint8_t* jpeg_data, int jpeg_len)`
- **Behavior:**
  - `track_index`: 0-based track index in the current iTunesDB (same as used by `ipod_add_track` / `ipod_update_track`).
  - `jpeg_data` / `jpeg_len`: pointer and length of JPEG bytes (thumbnail, typically ≤400×400).
  - Use libgpod to set the track’s thumbnail (e.g. `itdb_track_set_thumbnails()` or equivalent). If libgpod expects a GdkPixbuf, decode the JPEG in C or use a minimal decoder and create the pixbuf (or patch libgpod to accept raw JPEG).
  - Return `0` on success, non-zero on failure.

## itdb_write and ArtworkDB

When the app calls `ipod_write_db`, the C side must call libgpod’s **`itdb_write()`** (or equivalent) so that it writes:

1. **iTunesDB** (and optionally iTunesSD) to `iPod_Control/iTunes/`
2. **ArtworkDB** and **ITHMB** files to `iPod_Control/Artwork/`

libgpod’s `itdb_write()` normally writes both when thumbnails have been set. Ensure the virtual filesystem mountpoint used for `iPod_Control` includes the Artwork directory and that the build is linked with libgpod’s ArtworkDB/ITHMB support.

## Emscripten export

Export the function so Emscripten generates `_ipod_set_track_artwork`. The TypeScript layer in `src/features/devices/ipod/wasm.ts` calls it via `wasmSetTrackArtwork(trackIndex, jpegBytes)`, which allocates a buffer in the WASM heap, copies the JPEG bytes in, calls the C function, and frees the buffer.

## Optional: parse ArtworkDB on load

When parsing an existing iPod (e.g. `ipod_parse_db`), the C side may optionally parse **ArtworkDB** from `iPod_Control/Artwork/ArtworkDB` so existing thumbnails are preserved and not clobbered on re-sync. The app’s `syncIpodToVirtualFS` will copy the device’s Artwork folder into the virtual FS before parse when this is implemented.
