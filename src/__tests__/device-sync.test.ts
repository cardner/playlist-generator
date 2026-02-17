/**
 * Tests for device sync path logic.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { getTrackPath, type TrackLookup } from "@/features/playlists/export";
import {
  buildDeviceMatchKey,
  buildDeviceMatchCandidates,
  hashDeviceFileContent,
  isTrackOnDeviceUsb,
} from "@/features/devices/device-scan";

const mockSyncPlaylistsToIpod = jest.fn().mockResolvedValue(undefined);
jest.mock("@/features/devices/ipod", () => ({
  syncPlaylistsToIpod: (...args: unknown[]) => mockSyncPlaylistsToIpod(...args),
}));

describe("getTrackPath with playlist subfolder", () => {
  it("adds correct depth for nested playlist folder", () => {
    const lookup: TrackLookup = {
      track: {
        id: "file-1-root-1",
        trackFileId: "file-1",
        libraryRootId: "root-1",
        tags: {
          title: "Track",
          artist: "Artist",
          album: "Album",
          genres: [],
        },
        updatedAt: Date.now(),
      },
      fileIndex: {
        id: "file-1-root-1",
        trackFileId: "file-1",
        libraryRootId: "root-1",
        relativePath: "Music/Album/Track.mp3",
        name: "Track.mp3",
        extension: "mp3",
        size: 123,
        mtime: 456,
        updatedAt: Date.now(),
      },
    };

    const result = getTrackPath(lookup, {
      playlistLocation: "subfolder",
      playlistSubfolderPath: "PLAYLISTS/ROCK",
      pathStrategy: "relative-to-playlist",
    });

    expect(result.path).toBe("../../Music/Album/Track.mp3");
    expect(result.hasRelativePath).toBe(true);
  });

  it("strips matching playlist root for Walkman-style paths", () => {
    const lookup: TrackLookup = {
      track: {
        id: "file-2-root-1",
        trackFileId: "file-2",
        libraryRootId: "root-1",
        tags: {
          title: "Track",
          artist: "Artist",
          album: "Album",
          genres: [],
        },
        updatedAt: Date.now(),
      },
      fileIndex: {
        id: "file-2-root-1",
        trackFileId: "file-2",
        libraryRootId: "root-1",
        relativePath: "MUSIC/Artist/Album/Track.mp3",
        name: "Track.mp3",
        extension: "mp3",
        size: 123,
        mtime: 456,
        updatedAt: Date.now(),
      },
    };

    const result = getTrackPath(lookup, {
      playlistLocation: "subfolder",
      playlistSubfolderPath: "MUSIC",
      pathStrategy: "relative-to-playlist",
    });

    expect(result.path).toBe("Artist/Album/Track.mp3");
    expect(result.hasRelativePath).toBe(true);
  });

  it("builds absolute paths with container prefix", () => {
    const lookup: TrackLookup = {
      track: {
        id: "file-3-root-1",
        trackFileId: "file-3",
        libraryRootId: "root-1",
        tags: {
          title: "Track",
          artist: "Artist",
          album: "Album",
          genres: [],
        },
        updatedAt: Date.now(),
      },
      fileIndex: {
        id: "file-3-root-1",
        trackFileId: "file-3",
        libraryRootId: "root-1",
        relativePath: "Artist/Album/Track.mp3",
        name: "Track.mp3",
        extension: "mp3",
        size: 123,
        mtime: 456,
        updatedAt: Date.now(),
      },
    };

    const result = getTrackPath(lookup, {
      playlistLocation: "root",
      pathStrategy: "absolute",
      absolutePathPrefix: "/media/music",
    });

    expect(result.path).toBe("/media/music/Artist/Album/Track.mp3");
    expect(result.hasRelativePath).toBe(true);
  });

  it("uses library-root-relative paths without ../ segments", () => {
    const lookup: TrackLookup = {
      track: {
        id: "file-4-root-1",
        trackFileId: "file-4",
        libraryRootId: "root-1",
        tags: {
          title: "Track",
          artist: "Artist",
          album: "Album",
          genres: [],
        },
        updatedAt: Date.now(),
      },
      fileIndex: {
        id: "file-4-root-1",
        trackFileId: "file-4",
        libraryRootId: "root-1",
        relativePath: "Artist/Album/Track.mp3",
        name: "Track.mp3",
        extension: "mp3",
        size: 123,
        mtime: 456,
        updatedAt: Date.now(),
      },
    };

    const result = getTrackPath(lookup, {
      playlistLocation: "root",
      pathStrategy: "relative-to-library-root",
    });

    expect(result.path).toBe("Artist/Album/Track.mp3");
    expect(result.path.includes("..")).toBe(false);
    expect(result.hasRelativePath).toBe(true);
  });
});

describe("buildDeviceMatchKey", () => {
  it("normalizes filename and combines metadata", () => {
    const key = buildDeviceMatchKey("Track.MP3", 100, 200);
    expect(key).toBe("track.mp3|100|200");
  });
});

describe("buildDeviceMatchCandidates", () => {
  it("returns filename|size first, then filename, then filename|size|mtime for backward compatibility", () => {
    const candidates = buildDeviceMatchCandidates({
      filename: "Track.MP3",
      size: 100,
      mtime: 200,
    });
    expect(candidates[0]).toBe("track.mp3|100");
    expect(candidates[1]).toBe("track.mp3");
    expect(candidates[2]).toBe("track.mp3|100|200");
  });

  it("handles filename only when size and mtime missing", () => {
    const candidates = buildDeviceMatchCandidates({ filename: "Track.mp3" });
    expect(candidates).toEqual(["track.mp3"]);
  });
});

describe("isTrackOnDeviceUsb", () => {
  it("returns false when devicePathMap is empty", () => {
    expect(
      isTrackOnDeviceUsb(
        { fileName: "track.mp3", fileSize: 100 },
        new Map()
      )
    ).toBe(false);
  });

  it("returns false when track has no filename", () => {
    const map = new Map([["track.mp3|100", "/MUSIC/track.mp3"]]);
    expect(isTrackOnDeviceUsb({ fileSize: 100 }, map)).toBe(false);
  });

  it("returns true when filename|size matches", () => {
    const map = new Map([["track.mp3|100", "/MUSIC/track.mp3"]]);
    expect(
      isTrackOnDeviceUsb({ fileName: "track.mp3", fileSize: 100 }, map)
    ).toBe(true);
  });

  it("returns true when filename-only fallback matches", () => {
    const map = new Map([["track.mp3", "/MUSIC/track.mp3"]]);
    expect(isTrackOnDeviceUsb({ fileName: "Track.MP3" }, map)).toBe(true);
  });

  it("uses fileIndexMap when track lacks fileName", () => {
    const map = new Map([["song.mp3|200", "/MUSIC/song.mp3"]]);
    const fileIndexMap = new Map([
      ["tid-1", { name: "song.mp3", size: 200, mtime: 100 }],
    ]);
    expect(
      isTrackOnDeviceUsb(
        { trackFileId: "tid-1", fileSize: 200 },
        map,
        fileIndexMap
      )
    ).toBe(true);
  });

  it("returns false when no candidate matches", () => {
    const map = new Map([["other.mp3", "/MUSIC/other.mp3"]]);
    expect(
      isTrackOnDeviceUsb({ fileName: "track.mp3", fileSize: 100 }, map)
    ).toBe(false);
  });
});

describe("hashDeviceFileContent", () => {
  it("returns stable hashes for identical content", async () => {
    if (!globalThis.crypto?.subtle || typeof File === "undefined") {
      return;
    }
    const file = new File(["hello world"], "track.mp3", { type: "audio/mpeg" });
    const first = await hashDeviceFileContent(file, 1024);
    const second = await hashDeviceFileContent(file, 1024);
    expect(first).toBe(second);
  });
});

describe("syncPlaylistsToDevice iPod onlyReferenceExistingTracks", () => {
  beforeEach(() => {
    mockSyncPlaylistsToIpod.mockClear();
  });

  it("passes onlyReferenceExistingTracks to iPod targets when provided", async () => {
    const { syncPlaylistsToDevice } = await import("@/features/devices/device-sync");
    const profile = {
      id: "ipod-1",
      deviceType: "ipod",
      handleRef: "handle-1",
      label: "iPod",
      playlistFormat: "m3u" as const,
      playlistFolder: "",
      pathStrategy: "relative-to-playlist" as const,
      lastSyncAt: 0,
    } as import("@/db/schema").DeviceProfileRecord;
    const targets = [
      {
        playlist: {
          id: "pl-1",
          title: "Playlist",
          trackFileIds: [],
          trackSelections: new Map(),
          strategy: {},
          summary: {} as never,
        },
        trackLookups: [],
        libraryRootId: "root-1",
      },
    ];
    await syncPlaylistsToDevice({
      deviceProfile: profile,
      targets,
      onlyReferenceExistingTracks: true,
    });
    expect(mockSyncPlaylistsToIpod).toHaveBeenCalledTimes(1);
    const [call] = mockSyncPlaylistsToIpod.mock.calls;
    const options = call[0];
    const passedTargets = options?.targets ?? [];
    expect(passedTargets.length).toBeGreaterThan(0);
    expect(passedTargets[0].onlyReferenceExistingTracks).toBe(true);
  });
});

describe("syncPlaylistsToDevice iPod overwriteExistingPlaylist", () => {
  beforeEach(() => {
    mockSyncPlaylistsToIpod.mockClear();
  });

  it("passes overwriteExistingPlaylist to syncPlaylistsToIpod when provided", async () => {
    const { syncPlaylistsToDevice } = await import("@/features/devices/device-sync");
    const profile = {
      id: "ipod-1",
      deviceType: "ipod",
      handleRef: "handle-1",
      label: "iPod",
      playlistFormat: "m3u" as const,
      playlistFolder: "",
      pathStrategy: "relative-to-playlist" as const,
      lastSyncAt: 0,
    } as import("@/db/schema").DeviceProfileRecord;
    const targets = [
      {
        playlist: {
          id: "pl-1",
          title: "Playlist",
          trackFileIds: [],
          trackSelections: new Map(),
          strategy: {},
          summary: {} as never,
        },
        trackLookups: [],
        libraryRootId: "root-1",
      },
    ];
    await syncPlaylistsToDevice({
      deviceProfile: profile,
      targets,
      overwriteExistingPlaylist: true,
    });
    expect(mockSyncPlaylistsToIpod).toHaveBeenCalledTimes(1);
    const [call] = mockSyncPlaylistsToIpod.mock.calls;
    const options = call[0];
    expect(options?.overwriteExistingPlaylist).toBe(true);
  });
});
