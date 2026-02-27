/**
 * Unit tests for iPod DB API (pure TS surface).
 */

import {
  createEmptyModel,
  parseITunesDBFromBuffer,
  getDeviceInfo,
  getTracks,
  getPlaylists,
  getPlaylistTracks,
  createPlaylist,
  playlistAddTrack,
  addTrack,
  getTrackDestPath,
  setTrackPath,
  finalizeLastTrackNoStat,
  writeITunesDB,
  writeArtwork,
  getLastError,
  setTrackArtwork,
} from "@/features/devices/ipod/ipod-db-api";
import { serializeITunesDB } from "@/features/devices/ipod/itunesdb/serialize";

describe("ipod-db-api", () => {
  it("createEmptyModel has Library playlist", () => {
    const model = createEmptyModel(undefined, 0x0b);
    expect(model.dbversion).toBe(0x0b);
    expect(model.tracks).toEqual([]);
    expect(model.playlists).toHaveLength(1);
    expect(model.playlists![0].name).toBe("Library");
    expect(model.playlists![0].is_master).toBe(true);
  });

  it("addTrack and getTrackDestPath", () => {
    const model = createEmptyModel();
    const idx = addTrack(model, {
      title: "Song",
      artist: "Artist",
      album: "Album",
      durationMs: 120000,
      sizeBytes: 1000,
    });
    expect(idx).toBe(0);
    expect(getTracks(model)).toHaveLength(1);
    expect(getTracks(model)[0].title).toBe("Song");
    const path = getTrackDestPath(model, "song.mp3");
    expect(path).toMatch(/iPod_Control\/Music\/F00\/[A-Z]{4}\.mp3/);
    setTrackPath(model, 0, path);
    expect(getTracks(model)[0].ipod_path).toMatch(/^:iPod_Control:Music:F00:[A-Z]{4}\.mp3$/);
  });

  it("finalizeLastTrackNoStat sets path and size", () => {
    const model = createEmptyModel();
    addTrack(model, { title: "X", artist: "Y", album: "Z" });
    finalizeLastTrackNoStat(model, "iPod_Control/Music/F01/x.mp3", 2000);
    expect(getTracks(model)[0].ipod_path).toBe(":iPod_Control:Music:F01:x.mp3");
    expect(getTracks(model)[0].size).toBe(2000);
  });

  it("getTrackDestPath avoids F02 when track has colon-format ipod_path in F02", () => {
    const model = createEmptyModel();
    addTrack(model, { title: "First", artist: "A", album: "B" });
    finalizeLastTrackNoStat(model, "iPod_Control/Music/F02/ABCD.mp3", 1000);
    const path = getTrackDestPath(model, "second.mp3");
    expect(path).not.toContain("F02");
    expect(path).toMatch(/iPod_Control\/Music\/F\d{2}\/[A-Z]{4}\.mp3/);
  });

  it("createPlaylist and playlistAddTrack", () => {
    const model = createEmptyModel();
    addTrack(model, { title: "A", artist: "B", album: "C" });
    const plIdx = createPlaylist(model, "My List");
    expect(plIdx).toBe(1);
    playlistAddTrack(model, plIdx, 0);
    expect(getPlaylists(model)).toHaveLength(2);
    const tracks = getPlaylistTracks(model, plIdx);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe("A");
  });

  it("parseITunesDBFromBuffer and writeITunesDB round-trip", () => {
    const model = createEmptyModel(undefined, 0x0b);
    addTrack(model, { title: "T", artist: "A", album: "B" });
    finalizeLastTrackNoStat(model, "iPod_Control/Music/F00/t.mp3", 1000);
    const buf = writeITunesDB(model);
    expect(buf).not.toBeNull();
    expect(getLastError()).toBeNull();
    const parsed = parseITunesDBFromBuffer(buf!);
    expect(parsed).not.toBeNull();
    expect(getTracks(parsed!).length).toBe(1);
    expect(getTracks(parsed!)[0].title).toBe("T");
  });

  it("setTrackArtwork stores in model", () => {
    const model = createEmptyModel();
    addTrack(model, { title: "X", artist: "Y", album: "Z" });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    expect(setTrackArtwork(model, 0, jpeg)).toBe(0);
    expect(model.artwork).toHaveLength(1);
    expect(model.artwork![0].trackIndex).toBe(0);
    expect(model.artwork![0].jpegBytes).toBe(jpeg);
  });

  it("writeArtwork returns ArtworkDB and ITHMB when model has artwork", () => {
    const model = createEmptyModel();
    addTrack(model, { title: "A", artist: "B", album: "C" });
    setTrackArtwork(model, 0, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    const result = writeArtwork(model);
    expect(result.ArtworkDB).toBeDefined();
    expect(result.ArtworkDB!.length).toBeGreaterThan(0);
    expect(result.ITHMB).toBeDefined();
    expect(result.ITHMB!.has("F0000_1.ithmb")).toBe(true);
    expect(result.ITHMB!.get("F0000_1.ithmb")!.length).toBeGreaterThan(0);
  });
});
