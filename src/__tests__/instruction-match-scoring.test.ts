import { describe, it, expect } from "@jest/globals";
import { calculateInstructionMatch } from "@/features/playlists/scoring";
import type { TrackRecord } from "@/db/schema";

function mockTrack(overrides: Partial<TrackRecord> = {}): TrackRecord {
  return {
    id: "test-id",
    trackFileId: "track-1",
    libraryRootId: "root-1",
    tags: {
      title: "Test Song",
      artist: "Test Artist",
      album: "Test Album",
      genres: ["Rock"],
      year: 2020,
      trackNo: 1,
    },
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("calculateInstructionMatch", () => {
  it("returns score 0 and empty reasons when instructions empty", () => {
    const track = mockTrack();
    const result = calculateInstructionMatch(track, undefined);
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);

    const result2 = calculateInstructionMatch(track, "");
    expect(result2.score).toBe(0);
    expect(result2.reasons).toEqual([]);
  });

  it("returns score 0 when no keywords match track metadata", () => {
    const track = mockTrack({
      tags: {
        title: "Sunset",
        artist: "Unknown",
        album: "Album",
        genres: ["Pop"],
        year: 2020,
        trackNo: 1,
      },
    });
    const result = calculateInstructionMatch(track, "jazz classical blues");
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("returns partial score when some keywords match", () => {
    const track = mockTrack({
      tags: {
        title: "Rock Anthem",
        artist: "Rock Band",
        album: "Rock Album",
        genres: ["Rock", "Indie"],
        year: 2020,
        trackNo: 1,
      },
    });
    const result = calculateInstructionMatch(track, "rock anthem jazz");
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
    expect(result.reasons.length).toBe(1);
  });

  it("returns high score when keywords match track metadata", () => {
    const track = mockTrack({
      tags: {
        title: "Blade Runner Theme",
        artist: "Vangelis",
        album: "Blade Runner",
        genres: ["Electronic", "Synth"],
        year: 1982,
        trackNo: 1,
      },
    });
    const result = calculateInstructionMatch(track, "blade runner vangelis");
    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.reasons.length).toBe(1);
  });

  it("searches enhancedMetadata mood and activity", () => {
    const track = mockTrack({
      enhancedMetadata: {
        mood: ["energetic", "uplifting"],
        activity: ["workout", "running"],
      },
    });
    const result = calculateInstructionMatch(track, "energetic workout");
    expect(result.score).toBeGreaterThan(0);
  });
});
