/**
 * Unit tests for sync-targets module.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  getSyncTargetsFromPlaylists,
  buildSyntheticPlaylist,
  getPresetCapabilities,
  getSyncTargetsFromCollectionTracks,
  getFullCollectionSyncTarget,
  mergeSyncTargets,
  type PlaylistSyncItem,
} from "@/features/devices/sync-targets";

describe("sync-targets", () => {
  describe("getSyncTargetsFromPlaylists", () => {
    const playlists: PlaylistSyncItem[] = [
      {
        playlist: {
          id: "p1",
          title: "Playlist 1",
          trackFileIds: ["t1", "t2"],
        } as PlaylistSyncItem["playlist"],
        libraryRootId: "root-1",
      },
      {
        playlist: {
          id: "p2",
          title: "Playlist 2",
          trackFileIds: ["t3"],
        } as PlaylistSyncItem["playlist"],
        libraryRootId: "root-1",
      },
    ];

    it("returns empty array when no playlists", () => {
      expect(getSyncTargetsFromPlaylists([], ["p1"])).toEqual([]);
    });

    it("returns empty array when no selected IDs", () => {
      expect(getSyncTargetsFromPlaylists(playlists, [])).toEqual([]);
    });

    it("filters playlists by selected IDs", () => {
      const result = getSyncTargetsFromPlaylists(playlists, ["p1"]);
      expect(result).toHaveLength(1);
      expect(result[0].playlist.id).toBe("p1");
    });

    it("returns multiple playlists when multiple selected", () => {
      const result = getSyncTargetsFromPlaylists(playlists, ["p1", "p2"]);
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.playlist.id)).toEqual(["p1", "p2"]);
    });

    it("returns singlePlaylist when provided", () => {
      const single = playlists[0];
      const result = getSyncTargetsFromPlaylists(playlists, ["p2"], single);
      expect(result).toHaveLength(1);
      expect(result[0].playlist.id).toBe("p1");
    });
  });

  describe("buildSyntheticPlaylist", () => {
    it("builds playlist with correct title and track IDs", () => {
      const result = buildSyntheticPlaylist("My Playlist", ["t1", "t2", "t3"]);
      expect(result.title).toBe("My Playlist");
      expect(result.trackFileIds).toEqual(["t1", "t2", "t3"]);
      expect(result.id).toMatch(/^manual-My Playlist-\d+$/);
      expect(result.summary.trackCount).toBe(3);
    });

    it("builds playlist with empty track list", () => {
      const result = buildSyntheticPlaylist("Empty", []);
      expect(result.trackFileIds).toEqual([]);
      expect(result.summary.trackCount).toBe(0);
    });
  });

  describe("getPresetCapabilities", () => {
    it("returns correct capabilities for ipod", () => {
      const caps = getPresetCapabilities("ipod");
      expect(caps.hasCollectionSync).toBe(true);
      expect(caps.hasUsbSync).toBe(true);
      expect(caps.hasExport).toBe(false);
      expect(caps.hasOnDeviceStatus).toBe(true);
      expect(caps.hasCollectionExport).toBe(false);
    });

    it("returns correct capabilities for walkman", () => {
      const caps = getPresetCapabilities("walkman");
      expect(caps.hasCollectionSync).toBe(true);
      expect(caps.hasUsbSync).toBe(true);
      expect(caps.hasCollectionExport).toBe(false);
    });

    it("returns correct capabilities for jellyfin", () => {
      const caps = getPresetCapabilities("jellyfin");
      expect(caps.hasCollectionSync).toBe(false);
      expect(caps.hasUsbSync).toBe(false);
      expect(caps.hasExport).toBe(true);
      expect(caps.hasCollectionExport).toBe(true);
      expect(caps.hasOnDeviceStatus).toBe(false);
    });

    it("returns fallback for unknown preset", () => {
      const caps = getPresetCapabilities("unknown");
      expect(caps.hasCollectionSync).toBe(false);
      expect(caps.hasUsbSync).toBe(true);
      expect(caps.hasExport).toBe(false);
    });
  });

  describe("getSyncTargetsFromCollectionTracks", () => {
    const mockBuildTrackLookups = jest.fn(async (trackIds: string[]) =>
      trackIds.map((id) => ({
        track: { trackFileId: id },
        fileIndex: { relativePath: `${id}.mp3` },
      }))
    );

    beforeEach(() => {
      mockBuildTrackLookups.mockClear();
    });

    it("returns empty array when no track IDs", async () => {
      const result = await getSyncTargetsFromCollectionTracks(
        [],
        "col-1",
        "Collection A",
        mockBuildTrackLookups
      );
      expect(result).toEqual([]);
      expect(mockBuildTrackLookups).not.toHaveBeenCalled();
    });

    it("builds sync target from selected track IDs", async () => {
      const result = await getSyncTargetsFromCollectionTracks(
        ["t1", "t2"],
        "col-1",
        "Collection A",
        mockBuildTrackLookups
      );
      expect(result).toHaveLength(1);
      expect(result[0].playlist.title).toBe("Selected Tracks - Collection A");
      expect(result[0].playlist.trackFileIds).toEqual(["t1", "t2"]);
      expect(result[0].libraryRootId).toBe("col-1");
      expect(mockBuildTrackLookups).toHaveBeenCalledWith(
        ["t1", "t2"],
        "col-1",
        undefined
      );
    });

    it("accepts Set of track IDs", async () => {
      const result = await getSyncTargetsFromCollectionTracks(
        new Set(["t1"]),
        "col-1",
        "Col",
        mockBuildTrackLookups
      );
      expect(result[0].playlist.trackFileIds).toEqual(["t1"]);
    });
  });

  describe("getFullCollectionSyncTarget", () => {
    const mockBuildTrackLookups = jest.fn(async (trackIds: string[]) =>
      trackIds.map((id) => ({
        track: { trackFileId: id },
        fileIndex: { relativePath: `${id}.mp3` },
      }))
    );

    beforeEach(() => {
      mockBuildTrackLookups.mockClear();
    });

    it("builds full collection target with mirror options", async () => {
      const result = await getFullCollectionSyncTarget(
        ["t1", "t2", "t3"],
        "col-1",
        "My Collection",
        mockBuildTrackLookups,
        { mirrorMode: true, mirrorDeleteFromDevice: true }
      );
      expect(result.playlist.title).toBe("Collection - My Collection");
      expect(result.playlist.trackFileIds).toEqual(["t1", "t2", "t3"]);
      expect(result.mirrorMode).toBe(true);
      expect(result.mirrorDeleteFromDevice).toBe(true);
      expect(mockBuildTrackLookups).toHaveBeenCalledWith(
        ["t1", "t2", "t3"],
        "col-1",
        { tryLazyFileIndex: true }
      );
    });
  });

  describe("mergeSyncTargets", () => {
    it("returns playlist targets when non-empty", () => {
      const playlistTargets = [{ playlist: { id: "p1" } }] as PlaylistSyncItem[];
      const collectionTargets = [{ playlist: { id: "c1" } }] as Parameters<
        typeof mergeSyncTargets
      >[1];
      const result = mergeSyncTargets(playlistTargets, collectionTargets);
      expect(result).toBe(playlistTargets);
      expect(result).toHaveLength(1);
    });

    it("returns collection targets when playlist targets empty", () => {
      const collectionTargets = [{ playlist: { id: "c1" } }] as Parameters<
        typeof mergeSyncTargets
      >[1];
      const result = mergeSyncTargets([], collectionTargets);
      expect(result).toBe(collectionTargets);
    });
  });
});
