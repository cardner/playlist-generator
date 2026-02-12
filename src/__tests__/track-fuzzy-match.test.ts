/**
 * Tests for track fuzzy matching (playlist import)
 */

import { describe, it, expect } from "@jest/globals";
import { fuzzyMatchTrack } from "@/features/playlists/track-fuzzy-match";
import type { TrackRecord } from "@/db/schema";

const createTrack = (overrides: Partial<TrackRecord> & { trackFileId: string }) =>
  ({
    id: `${overrides.trackFileId}-root1`,
    trackFileId: overrides.trackFileId,
    libraryRootId: "root1",
    tags: { title: "", artist: "", album: "" },
    tech: {},
    updatedAt: 0,
    ...overrides,
  }) as TrackRecord;

describe("fuzzyMatchTrack", () => {
  const targetTracks: TrackRecord[] = [
    createTrack({
      trackFileId: "file-a",
      tags: { title: "Hello World", artist: "Artist One", album: "First Album" },
      tech: { durationSeconds: 180 },
    }),
    createTrack({
      trackFileId: "file-b",
      tags: { title: "Different Song", artist: "Artist Two", album: "Second" },
      tech: { durationSeconds: 200 },
    }),
    createTrack({
      trackFileId: "file-c",
      tags: { title: "Hello World (Remix)", artist: "Artist One", album: "First Album" },
      tech: { durationSeconds: 185 },
    }),
  ];

  it("returns exact match when trackFileId exists in target", () => {
    const result = fuzzyMatchTrack(
      { trackFileId: "file-b", title: "Different Song", artist: "Artist Two" },
      "file-b",
      targetTracks
    );
    expect(result).toBe("file-b");
  });

  it("returns fuzzy match when metadata matches and trackFileId differs", () => {
    const result = fuzzyMatchTrack(
      { trackFileId: "old-id", title: "Hello World", artist: "Artist One", album: "First Album", durationSeconds: 180 },
      "old-id",
      targetTracks
    );
    expect(result).toBe("file-a");
  });

  it("returns null when no metadata for fuzzy match", () => {
    const result = fuzzyMatchTrack(
      { trackFileId: "missing", title: "", artist: "" },
      "missing",
      targetTracks
    );
    expect(result).toBeNull();
  });

  it("returns null when metadata does not match any target track", () => {
    const result = fuzzyMatchTrack(
      { trackFileId: "x", title: "Unknown Song", artist: "Unknown Artist" },
      "x",
      targetTracks
    );
    expect(result).toBeNull();
  });

  it("respects minScore threshold", () => {
    const result = fuzzyMatchTrack(
      { trackFileId: "x", title: "Hell", artist: "Artist" },
      "x",
      targetTracks,
      0.95
    );
    expect(result).toBeNull();
  });
});
