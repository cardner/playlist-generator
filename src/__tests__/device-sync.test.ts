/**
 * Tests for device sync path logic.
 */

import { describe, it, expect } from "@jest/globals";
import { getTrackPath, type TrackLookup } from "@/features/playlists/export";
import {
  buildDeviceMatchKey,
  buildDeviceMatchCandidates,
  hashDeviceFileContent,
} from "@/features/devices/device-scan";

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
