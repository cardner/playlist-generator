# iPod DB fixtures

Use these for unit tests for the pure TS iTunesDB/ArtworkDB implementation.

## Adding fixtures

- **iTunesDB**: Copy from a real iPod at `iPod_Control/iTunes/iTunesDB`. Name by dbversion if needed (e.g. `itunesdb-dbversion-0x14.bin`). Add one per targeted dbversion range (0x0b, 0x0d, 0x12, 0x14, 0x19) for parser/serializer tests.
- **ArtworkDB / ITHMB**: From `iPod_Control/Artwork/` (ArtworkDB and F* .ithmb files) for artwork round-trip tests.
- **SysInfo**: From `iPod_Control/Device/SysInfo` (and optionally SysInfoExtended) for device info parser tests.

For Jest we can load small binaries via `fs.readFileSync` in Node or use TS/JSON exports for minimal fixtures. Large dumps can be gitignored and documented here; tests can generate minimal in-memory buffers for chunk structure checks.
