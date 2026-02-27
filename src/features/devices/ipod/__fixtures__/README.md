# iPod DB fixtures

Use these for unit tests for the pure TS iTunesDB/ArtworkDB implementation.

## Adding fixtures

- **iTunesDB**: Copy from a real iPod at `iPod_Control/iTunes/iTunesDB`. Name by dbversion if needed (e.g. `itunesdb-dbversion-0x14.bin`). Add one per targeted dbversion range (0x0b, 0x0d, 0x12, 0x14, 0x19) for parser/serializer tests.
- **ArtworkDB / ITHMB**: From `iPod_Control/Artwork/` (ArtworkDB and F* .ithmb files) for artwork round-trip tests.
- **SysInfo**: From `iPod_Control/Device/SysInfo` (and optionally SysInfoExtended) for device info parser tests.

For Jest we can load small binaries via `fs.readFileSync` in Node or use TS/JSON exports for minimal fixtures. Large dumps can be gitignored and documented here; tests can generate minimal in-memory buffers for chunk structure checks.

## Expected dbversion by model (empty restore)

When an iPod is freshly restored with iTunes, the 4-byte little-endian dbversion at offset 16 of `iPod_Control/iTunes/iTunesDB` should match the device:

- **5th gen (MA002)**: 0x0b (0x9c mhit header)
- **6th/7th gen Classic (MB029)**: 0x14 or 0x15 (0x184 mhit header)
- **Nano 1st/2nd**: 0x0b / 0x0d; **Nano 3rd+**: 0x14 range

To confirm from a real device: `xxd -s 16 -l 4 -e iPod_Control/iTunes/iTunesDB` (or read bytes 16–19 in code). Optional fixture: copy an empty 5th gen iTunesDB as `itunesdb-5th-gen-empty.bin` for parser/dbversion tests.
