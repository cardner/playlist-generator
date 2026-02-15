/**
 * Unit tests for library summarization
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { TrackRecord } from "@/db/schema";

// Mutable tracks array - tests push to this before calling summarizeLibrary
const mockTracks: TrackRecord[] = [];

function createTrack(
  id: string,
  opts: { updatedAt: number; addedAt?: number; genres?: string[]; artist?: string }
): TrackRecord {
  return {
    id: `${id}-root1`,
    trackFileId: id,
    libraryRootId: "root1",
    tags: {
      title: "Track",
      artist: opts.artist ?? "Artist",
      album: "Album",
      genres: opts.genres ?? ["Rock"],
      year: undefined,
      trackNo: undefined,
      discNo: undefined,
    },
    tech: {},
    updatedAt: opts.updatedAt,
    addedAt: opts.addedAt,
  } as TrackRecord;
}

const createEach = (tracks: TrackRecord[]) => ({
  each: async (cb: (t: TrackRecord) => void) => {
    for (const t of tracks) {
      cb(t);
    }
  },
});

jest.mock("@/db/schema", () => {
  const actual = jest.requireActual("@/db/schema");
  return {
    ...actual,
    db: {
      tracks: {
        toCollection: () => createEach(mockTracks),
        where: () => ({
          equals: () => createEach(mockTracks),
        }),
      },
    },
  };
});

// Import after mock
import { summarizeLibrary } from "@/features/library/summarization";

describe("summarizeLibrary - recently added counts", () => {
  beforeEach(() => {
    mockTracks.length = 0;
  });

  it("uses addedAt when present for recently added counts", async () => {
    const now = Date.now();
    const sixDaysAgo = now - 6 * 24 * 60 * 60 * 1000;
    const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;

    mockTracks.push(
      createTrack("recent", {
        updatedAt: now,
        addedAt: sixDaysAgo,
      }),
      createTrack("old", {
        updatedAt: now,
        addedAt: eightDaysAgo,
      })
    );

    const result = await summarizeLibrary(undefined, false);
    expect(result.recentlyAdded.last7Days).toBe(1);
    expect(result.recentlyAdded.last30Days).toBe(2);
  });

  it("falls back to updatedAt when addedAt is missing (legacy tracks)", async () => {
    const now = Date.now();
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
    const fortyDaysAgo = now - 40 * 24 * 60 * 60 * 1000;

    mockTracks.push(
      createTrack("legacy-recent", {
        updatedAt: threeDaysAgo,
        addedAt: undefined,
      }),
      createTrack("legacy-old", {
        updatedAt: fortyDaysAgo,
        addedAt: undefined,
      })
    );

    const result = await summarizeLibrary(undefined, false);
    expect(result.recentlyAdded.last7Days).toBe(1);
    expect(result.recentlyAdded.last30Days).toBe(1);
  });

  it("prefers addedAt over updatedAt when both present", async () => {
    const now = Date.now();
    const sixDaysAgo = now - 6 * 24 * 60 * 60 * 1000;
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

    // Track added 6 days ago but updated 2 days ago - should count as 6 days (addedAt)
    mockTracks.push(
      createTrack("recently-updated", {
        updatedAt: twoDaysAgo,
        addedAt: sixDaysAgo,
      })
    );

    const result = await summarizeLibrary(undefined, false);
    expect(result.recentlyAdded.last7Days).toBe(1);
    expect(result.recentlyAdded.last24Hours).toBe(0);
  });
});
