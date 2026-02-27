# iPod DB pure TypeScript/JavaScript implementation

This document describes the in-repo implementation that replaces the prebuilt `ipod_manager` WASM (libgpod) with pure TS/JS for parsing and serializing iTunesDB, ArtworkDB, and ITHMB.

## References

- **iTunesDB format**: [wikiPodLinux iTunesDB](http://www.ipodlinux.org/ITunesDB/), [Basic Information](http://www.ipodlinux.org/ITunesDB/Basic_Information.html), [iTunesDB File](http://www.ipodlinux.org/ITunesDB/iTunesDB_File.html). Chunk-based; little-endian; dbversion determines mhbd/mhit header sizes.
- **libgpod**: [Itdb_iTunesDB structure](https://tmz.fedorapeople.org/docs/libgpod/libgpod-The-Itdb-iTunesDB-structure.html), Tracks, Playlists, Artwork sections. Used as reference for field semantics and write order.
- **ArtworkDB / ITHMB**: Less documented; structure reverse-engineered from libgpod source and gtkpod-devel (e.g. [Info about ithmb](https://sourceforge.net/p/gtkpod/mailman/message/5133870/)). ArtworkDB indexes by track; ITHMB holds thumbnail blobs (e.g. `Fxxxx_y.ithmb`).

## Fixtures

See `src/features/devices/ipod/__fixtures__/README.md` for how to add and use fixture files (iTunesDB, ArtworkDB, ITHMB, SysInfo) for parser/serializer and round-trip tests.

## Implementation layout

- **Types**: `src/features/devices/ipod/db-types.ts` — `IpodDbModel`, `IpodTrack`, `IpodPlaylist`, `IpodDeviceInfo`, `IpodTrackArtwork`.
- **Binary helpers**: `src/features/devices/ipod/itunesdb/binary.ts` — LE read/write, chunk header reader, UTF-16LE string helpers.
- **Parser**: `src/features/devices/ipod/itunesdb/parse.ts` — `parseITunesDB(buffer)` → model.
- **Serializer**: `src/features/devices/ipod/itunesdb/serialize.ts` — `serializeITunesDB(model)` → buffer.
- **Device info**: `src/features/devices/ipod/device/parse-sysinfo.ts` — `getDeviceInfoFromSysInfo(buffer)`.
- **Paths**: `src/features/devices/ipod/paths-db.ts` — iPod path ↔ FS path in TS.
- **API**: `src/features/devices/ipod/ipod-db-api.ts` — model API replacing WASM calls (create, parse, get*, add*, write, setTrackArtwork, etc.).

## Supported dbversions (iTunesDB)

| dbversion (hex) | mhbd header | mhit header | Notes           |
|-----------------|-------------|-------------|-----------------|
| 0x09–0x0b       | 0x68        | 0x9c        | Older classics  |
| 0x0c–0x15       | 0x68        | 0xf4→0x184  | 5G, Nano, 7.1   |
| 0x17–0x19       | 0xBC        | 0x184       | Nano 3G, Classic|

Artwork is supported via ArtworkDB and ITHMB for iPod Photo, 5G, Nano, and Classic.
