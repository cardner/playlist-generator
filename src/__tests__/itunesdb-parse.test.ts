/**
 * Unit tests for iTunesDB parser and serializer round-trip.
 */

import { parseITunesDB } from "@/features/devices/ipod/itunesdb/parse";
import { serializeITunesDB } from "@/features/devices/ipod/itunesdb/serialize";
import { writeChunkType, writeU32LE } from "@/features/devices/ipod/itunesdb/binary";
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
