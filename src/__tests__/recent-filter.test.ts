import { describe, it, expect } from "@jest/globals";
import { applyRecentFilter } from "@/features/playlists/recent-filter";
import type { TrackRecord } from "@/db/schema";
import type { PlaylistRequest } from "@/types/playlist";

function createTrack(
  trackFileId: string,
  updatedAt: number,
  addedAt?: number
): TrackRecord {
  return {
    id: `${trackFileId}-root1`,
    trackFileId,
    libraryRootId: "root1",
    tags: {
      title: "Track",
      artist: "Artist",
      album: "Album",
      genres: ["Rock"],
      year: undefined,
      trackNo: undefined,
      discNo: undefined,
    },
    updatedAt,
    addedAt,
  } as TrackRecord;
}

const baseRequest: PlaylistRequest = {
  genres: ["rock"],
  length: { type: "minutes", value: 30 },
  mood: ["energetic"],
  activity: ["workout"],
  tempo: { bucket: "medium" },
  surprise: 0.5,
};

describe("applyRecentFilter", () => {
  it("returns all tracks when sourcePool is 'all'", () => {
    const tracks = [
      createTrack("t1", 0),
      createTrack("t2", Date.now()),
    ];
    const result = applyRecentFilter(tracks, { ...baseRequest, sourcePool: "all" });
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.trackFileId)).toEqual(["t1", "t2"]);
  });

  it("returns all tracks when sourcePool is undefined (defaults to all)", () => {
    const tracks = [
      createTrack("t1", 0),
      createTrack("t2", Date.now()),
    ];
    const result = applyRecentFilter(tracks, baseRequest);
    expect(result).toHaveLength(2);
  });

  it("filters by 7d window - keeps only tracks within last 7 days", () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;

    const tracks = [
      createTrack("recent", now - 1000),
      createTrack("edge", sevenDaysAgo + 1000),
      createTrack("old", eightDaysAgo),
    ];

    const result = applyRecentFilter(tracks, {
      ...baseRequest,
      sourcePool: "recent",
      recentWindow: "7d",
    });

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.trackFileId)).toContain("recent");
    expect(result.map((t) => t.trackFileId)).toContain("edge");
    expect(result.map((t) => t.trackFileId)).not.toContain("old");
  });

  it("filters by 30d window when recentWindow is 30d", () => {
    const now = Date.now();
    const twentyNineDaysAgo = now - 29 * 24 * 60 * 60 * 1000;
    const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;

    const tracks = [
      createTrack("recent", twentyNineDaysAgo),
      createTrack("old", thirtyOneDaysAgo),
    ];

    const result = applyRecentFilter(tracks, {
      ...baseRequest,
      sourcePool: "recent",
      recentWindow: "30d",
    });

    expect(result).toHaveLength(1);
    expect(result[0].trackFileId).toBe("recent");
  });

  it("filters by 90d window when recentWindow is 90d", () => {
    const now = Date.now();
    const eightyNineDaysAgo = now - 89 * 24 * 60 * 60 * 1000;
    const ninetyOneDaysAgo = now - 91 * 24 * 60 * 60 * 1000;

    const tracks = [
      createTrack("recent", eightyNineDaysAgo),
      createTrack("old", ninetyOneDaysAgo),
    ];

    const result = applyRecentFilter(tracks, {
      ...baseRequest,
      sourcePool: "recent",
      recentWindow: "90d",
    });

    expect(result).toHaveLength(1);
    expect(result[0].trackFileId).toBe("recent");
  });

  it("defaults to 30d window when sourcePool is recent and recentWindow missing", () => {
    const now = Date.now();
    const twentyNineDaysAgo = now - 29 * 24 * 60 * 60 * 1000;
    const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;

    const tracks = [
      createTrack("recent", twentyNineDaysAgo),
      createTrack("old", thirtyOneDaysAgo),
    ];

    const result = applyRecentFilter(tracks, {
      ...baseRequest,
      sourcePool: "recent",
      // recentWindow omitted
    });

    expect(result).toHaveLength(1);
    expect(result[0].trackFileId).toBe("recent");
  });

  it("uses recentTrackCount to take last N tracks by date", () => {
    const now = Date.now();
    const tracks = [
      createTrack("oldest", now - 10000),
      createTrack("middle", now - 5000),
      createTrack("newest", now - 100),
    ];

    const result = applyRecentFilter(tracks, {
      ...baseRequest,
      sourcePool: "recent",
      recentTrackCount: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0].trackFileId).toBe("newest");
    expect(result[1].trackFileId).toBe("middle");
  });

  it("uses addedAt when present, falls back to updatedAt", () => {
    const now = Date.now();
    const oldUpdatedAt = now - 60 * 24 * 60 * 60 * 1000; // 60 days ago
    const recentAddedAt = now - 2 * 24 * 60 * 60 * 1000; // 2 days ago

    const tracks = [
      createTrack("withAddedAt", oldUpdatedAt, recentAddedAt),
      createTrack("noAddedAt", oldUpdatedAt),
    ];

    const result = applyRecentFilter(tracks, {
      ...baseRequest,
      sourcePool: "recent",
      recentWindow: "7d",
    });

    // withAddedAt should be kept (addedAt is 2 days ago)
    // noAddedAt should be dropped (updatedAt is 60 days ago)
    expect(result).toHaveLength(1);
    expect(result[0].trackFileId).toBe("withAddedAt");
  });
});
