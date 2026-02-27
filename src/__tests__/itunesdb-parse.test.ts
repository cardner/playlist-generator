/**
 * Unit tests for iTunesDB parser and serializer round-trip.
 */

import { parseITunesDB } from "@/features/devices/ipod/itunesdb/parse";
import { serializeITunesDB } from "@/features/devices/ipod/itunesdb/serialize";
import { writeChunkType, writeU32LE, readU32LE, readU64LE } from "@/features/devices/ipod/itunesdb/binary";
import { ipodPathToDbFormat, dbPathToFsPath } from "@/features/devices/ipod/paths-db";

describe("itunesdb/parse", () => {
  it("parses minimal mhbd (no mhsd children) and returns dbversion and empty lists", () => {
    const buf = new Uint8Array(0x68);
    writeChunkType(buf, 0, "mhbd");
    writeU32LE(buf, 4, 0x68);
    writeU32LE(buf, 8, 0x68);
    writeU32LE(buf, 16, 0x0b);
    writeU32LE(buf, 20, 0);

    const model = parseITunesDB(buf);
    expect(model.dbversion).toBe(0x0b);
    expect(model.tracks).toEqual([]);
    expect(model.playlists).toEqual([]);
  });

  it("parses mhbd with one mhsd (type 1) and mhlt with zero tracks", () => {
    const mhbdLen = 0x68;
    const mhsdHeader = 0x18;
    const mhltLen = 12;
    const mhsdTotal = mhsdHeader + mhltLen;
    const fileLen = mhbdLen + mhsdTotal;
    const buf = new Uint8Array(fileLen);

    let off = 0;
    writeChunkType(buf, off, "mhbd");
    off += 4;
    writeU32LE(buf, off, 0x68);
    off += 4;
    writeU32LE(buf, off, fileLen);
    off += 4;
    writeU32LE(buf, 16, 0x0b);
    writeU32LE(buf, 20, 1);
    off = mhbdLen;

    writeChunkType(buf, off, "mhsd");
    writeU32LE(buf, off + 4, mhsdHeader);
    writeU32LE(buf, off + 8, mhsdTotal);
    writeU32LE(buf, off + 12, 1);
    off += mhsdHeader;

    writeChunkType(buf, off, "mhlt");
    writeU32LE(buf, off + 4, 0x0c);
    writeU32LE(buf, off + 8, 0);

    const model = parseITunesDB(buf);
    expect(model.dbversion).toBe(0x0b);
    expect(model.tracks).toEqual([]);
    expect(model.playlists).toEqual([]);
  });

  it("throws when buffer does not start with mhbd", () => {
    const buf = new Uint8Array(24);
    writeChunkType(buf, 0, "mhlt");
    expect(() => parseITunesDB(buf)).toThrow("Expected mhbd");
  });

  it("returns empty model when buffer too short", () => {
    const buf = new Uint8Array(10);
    const model = parseITunesDB(buf);
    expect(model.dbversion).toBe(0x0b);
    expect(model.tracks).toEqual([]);
    expect(model.playlists).toEqual([]);
  });

  it("round-trips: serialize then parse matches", () => {
    const model = {
      dbversion: 0x0b,
      tracks: [
        {
          id: 0,
          title: "Test Song",
          artist: "Test Artist",
          album: "Test Album",
          genre: "Rock",
          track_nr: 1,
          year: 2020,
          size: 4000000,
          tracklen: 180000,
          ipod_path: ":iPod_Control:Music:F02:test.mp3",
        },
      ],
      playlists: [
        { name: "Library", is_master: true, trackIds: [0] },
        { name: "My List", is_master: false, trackIds: [0] },
      ],
    };
    const buf = serializeITunesDB(model);
    const parsed = parseITunesDB(buf);
    expect(parsed.dbversion).toBe(model.dbversion);
    expect(parsed.tracks.length).toBe(1);
    expect(parsed.tracks[0].title).toBe("Test Song");
    expect(parsed.tracks[0].artist).toBe("Test Artist");
    expect(parsed.tracks[0].ipod_path).toBe(":iPod_Control:Music:F02:test.mp3");
    expect(parsed.playlists.length).toBe(2);
    expect(parsed.playlists[0].name).toBe("Library");
    expect(parsed.playlists[0].is_master).toBe(true);
    expect(parsed.playlists[1].name).toBe("My List");
    expect(parsed.playlists[1].trackIds).toEqual([0]);
  });

  it("serialize writes location in colon format when track has slash ipod_path", () => {
    const model = {
      dbversion: 0x0b,
      tracks: [
        {
          id: 0,
          title: "Slash Path",
          artist: "Artist",
          ipod_path: "iPod_Control/Music/F00/x.mp3",
          size: 1000,
          tracklen: 60000,
        },
      ],
      playlists: [{ name: "Library", is_master: true, trackIds: [0] }],
    };
    const buf = serializeITunesDB(model);
    const parsed = parseITunesDB(buf);
    expect(parsed.tracks.length).toBe(1);
    expect(parsed.tracks[0].ipod_path).toBe(":iPod_Control:Music:F00:x.mp3");
  });

  it("serialize uses colon fallback when track has no ipod_path", () => {
    const model = {
      dbversion: 0x0b,
      tracks: [
        { id: 0, title: "No Path", artist: "Artist", size: 1000, tracklen: 60000 },
      ],
      playlists: [{ name: "Library", is_master: true, trackIds: [0] }],
    };
    const buf = serializeITunesDB(model);
    const parsed = parseITunesDB(buf);
    expect(parsed.tracks.length).toBe(1);
    expect(parsed.tracks[0].ipod_path).toBe(":iPod_Control:Music:F00:track_0.mp3");
  });

  it("after round-trip first playlist is master and has all track IDs", () => {
    const model = {
      dbversion: 0x0b,
      tracks: [
        { id: 0, title: "A", ipod_path: ":iPod_Control:Music:F00:a.mp3", size: 1000, tracklen: 60000 },
        { id: 1, title: "B", ipod_path: ":iPod_Control:Music:F00:b.mp3", size: 1000, tracklen: 60000 },
      ],
      playlists: [
        { name: "Other", is_master: false, trackIds: [1] },
        { name: "Library", is_master: true, trackIds: [0] },
      ],
    };
    const buf = serializeITunesDB(model);
    const parsed = parseITunesDB(buf);
    expect(parsed.playlists.length).toBe(2);
    expect(parsed.playlists[0].is_master).toBe(true);
    expect(parsed.playlists[0].name).toBe("Library");
    expect(parsed.playlists[0].trackIds).toContain(0);
    expect(parsed.playlists[0].trackIds).toContain(1);
    expect(parsed.playlists[0].trackIds.length).toBe(parsed.tracks.length);
  });

  it("round-trips with dbversion 0x14 (6th/7th gen layout)", () => {
    const model = {
      dbversion: 0x14,
      tracks: [
        {
          id: 0,
          title: "Classic",
          artist: "Artist",
          ipod_path: ":iPod_Control:Music:F01:track.mp3",
          size: 2000000,
          tracklen: 240000,
        },
      ],
      playlists: [
        { name: "Library", is_master: true, trackIds: [0] },
      ],
    };
    const buf = serializeITunesDB(model);
    const parsed = parseITunesDB(buf);
    expect(parsed.dbversion).toBe(0x14);
    expect(parsed.tracks.length).toBe(1);
    expect(parsed.tracks[0].title).toBe("Classic");
    expect(parsed.playlists.length).toBe(1);
  });

  it("round-trips with dbversion 0x75 and 5 mhsd (iTunes-compatible 5th/7th gen)", () => {
    const model = {
      dbversion: 0x75,
      tracks: [
        {
          id: 0,
          title: "Video",
          artist: "Artist",
          ipod_path: ":iPod_Control:Music:F02:track.mp3",
          size: 1000000,
          tracklen: 120000,
        },
      ],
      playlists: [
        { name: "Library", is_master: true, trackIds: [0] },
      ],
    };
    const buf = serializeITunesDB(model);
    const parsed = parseITunesDB(buf);
    expect(parsed.dbversion).toBe(0x75);
    expect(parsed.tracks.length).toBe(1);
    expect(parsed.tracks[0].title).toBe("Video");
    expect(parsed.playlists.length).toBe(1);
    expect(parsed.playlists[0].trackIds).toEqual([0]);
  });

  it("writes sync timestamp at mhbd offset 0x18 when options.syncTimestamp provided", () => {
    const model = {
      dbversion: 0x75,
      tracks: [],
      playlists: [{ name: "Library", is_master: true, trackIds: [] }],
    };
    const timestamp = 0x1234567890abcdefn;
    const buf = serializeITunesDB(model, { syncTimestamp: timestamp });
    expect(buf.length).toBeGreaterThanOrEqual(0x20);
    expect(readU64LE(buf, 0x18)).toBe(timestamp);
  });

  it("round-trips mhsd 4 and 5 blobs when present on model", () => {
    const blob4 = new Uint8Array([0x04, 0x05, 0x06]);
    const blob5 = new Uint8Array([0x07, 0x08, 0x09, 0x0a]);
    const model = {
      dbversion: 0x0b,
      tracks: [],
      playlists: [{ name: "Library", is_master: true, trackIds: [] }],
      mhsdBlobs: { 4: blob4, 5: blob5 } as Record<number, Uint8Array>,
    };
    const buf = serializeITunesDB(model);
    const parsed = parseITunesDB(buf);
    expect(parsed.mhsdBlobs).toBeDefined();
    expect(parsed.mhsdBlobs![4]).toEqual(blob4);
    expect(parsed.mhsdBlobs![5]).toEqual(blob5);
  });

  it("mhod header size is 24 bytes in serialized output", () => {
    const model = {
      dbversion: 0x0b,
      tracks: [
        { id: 0, title: "Test", ipod_path: ":iPod_Control:Music:F00:t.mp3", size: 100, tracklen: 1000 },
      ],
      playlists: [{ name: "Library", is_master: true, trackIds: [0] }],
    };
    const buf = serializeITunesDB(model);
    const mhbdHeaderSize = readU32LE(buf, 4);
    const mhsdHeaderSize = readU32LE(buf, mhbdHeaderSize + 4);
    const mhltStart = mhbdHeaderSize + mhsdHeaderSize;
    const mhitStart = mhltStart + 12;
    const mhitHeaderSize = readU32LE(buf, mhitStart + 4);
    const firstMhodOffset = mhitStart + mhitHeaderSize;
    expect(readU32LE(buf, firstMhodOffset + 4)).toBe(24);
  });

  it("round-trips mediatype = 1 (audio) for tracks with large enough header", () => {
    const model = {
      dbversion: 0x14,
      tracks: [
        { id: 0, title: "Audio", ipod_path: ":iPod_Control:Music:F00:a.mp3", size: 100, tracklen: 1000 },
      ],
      playlists: [{ name: "Library", is_master: true, trackIds: [0] }],
    };
    const buf = serializeITunesDB(model);
    const parsed = parseITunesDB(buf);
    expect(parsed.tracks[0].mediatype).toBe(1);
  });

  it("preserves dbid through serialize -> parse round-trip", () => {
    const model = {
      dbversion: 0x0b,
      tracks: [
        { id: 0, dbid: 42n, title: "DbidTest", ipod_path: ":iPod_Control:Music:F00:d.mp3", size: 100, tracklen: 1000 },
      ],
      playlists: [{ name: "Library", is_master: true, trackIds: [0] }],
    };
    const buf = serializeITunesDB(model);
    const parsed = parseITunesDB(buf);
    expect(parsed.tracks[0].dbid).toBe(42n);
  });

  it("generates new dbids from max+1 for tracks without dbid", () => {
    const model = {
      dbversion: 0x0b,
      tracks: [
        { id: 0, dbid: 10n, title: "A", ipod_path: ":iPod_Control:Music:F00:a.mp3", size: 100, tracklen: 1000 },
        { id: 1, title: "B", ipod_path: ":iPod_Control:Music:F00:b.mp3", size: 100, tracklen: 1000 },
      ],
      playlists: [{ name: "Library", is_master: true, trackIds: [0, 1] }],
    };
    const buf = serializeITunesDB(model);
    const parsed = parseITunesDB(buf);
    expect(parsed.tracks[0].dbid).toBe(10n);
    expect(parsed.tracks[1].dbid).toBe(11n);
  });

  it("round-trips bitrate and samplerate", () => {
    const model = {
      dbversion: 0x0b,
      tracks: [
        {
          id: 0,
          title: "Rates",
          ipod_path: ":iPod_Control:Music:F00:r.mp3",
          size: 100,
          tracklen: 1000,
          bitrate: 320,
          samplerate: 44100,
        },
      ],
      playlists: [{ name: "Library", is_master: true, trackIds: [0] }],
    };
    const buf = serializeITunesDB(model);
    const parsed = parseITunesDB(buf);
    expect(parsed.tracks[0].bitrate).toBe(320);
    expect(parsed.tracks[0].samplerate).toBe(44100);
  });

  it("sets filetype mhod to 'AAC audio file' for .m4a tracks", () => {
    const model = {
      dbversion: 0x0b,
      tracks: [
        { id: 0, title: "AAC", ipod_path: ":iPod_Control:Music:F00:song.m4a", size: 100, tracklen: 1000 },
      ],
      playlists: [{ name: "Library", is_master: true, trackIds: [0] }],
    };
    const buf = serializeITunesDB(model);
    const text = new TextDecoder("utf-16le").decode(buf);
    expect(text).toContain("AAC audio file");
  });

  it("sets filetype mhod to 'MPEG audio file' for .mp3 tracks", () => {
    const model = {
      dbversion: 0x0b,
      tracks: [
        { id: 0, title: "MP3", ipod_path: ":iPod_Control:Music:F00:song.mp3", size: 100, tracklen: 1000 },
      ],
      playlists: [{ name: "Library", is_master: true, trackIds: [0] }],
    };
    const buf = serializeITunesDB(model);
    const text = new TextDecoder("utf-16le").decode(buf);
    expect(text).toContain("MPEG audio file");
  });
});

describe("paths-db", () => {
  it("round-trips path: FS slash to DB colon and back", () => {
    const fsPath = "iPod_Control/Music/F02/test.mp3";
    const dbPath = ipodPathToDbFormat(fsPath);
    expect(dbPath).toBe(":iPod_Control:Music:F02:test.mp3");
    expect(dbPathToFsPath(dbPath)).toBe(fsPath);
  });
  it("ipodPathToDbFormat yields colon-separated with leading colon", () => {
    const fsPath = "iPod_Control/Music/F00/a.mp3";
    const dbPath = ipodPathToDbFormat(fsPath);
    expect(dbPath).toBe(":iPod_Control:Music:F00:a.mp3");
    expect(dbPathToFsPath(dbPath)).toBe(fsPath);
  });
  it("dbPathToFsPath accepts both colon and slash DB paths", () => {
    const fsPath = "iPod_Control/Music/F01/file.mp3";
    expect(dbPathToFsPath(":iPod_Control:Music:F01:file.mp3")).toBe(fsPath);
    expect(dbPathToFsPath("iPod_Control/Music/F01/file.mp3")).toBe(fsPath);
  });
  it("normalizes leading slash and backslashes", () => {
    expect(ipodPathToDbFormat("/iPod_Control/Music/F00/x.mp3")).toBe(":iPod_Control:Music:F00:x.mp3");
    expect(dbPathToFsPath("iPod_Control\\Music\\F00\\x.mp3")).toBe("iPod_Control/Music/F00/x.mp3");
  });
});
