import { describe, it, expect } from "@jest/globals";
import {
  calculateGenreMixFit,
  calculateDiversity,
  calculateMoodMatch,
  calculateActivityMatch,
} from "@/features/playlists/scoring";
import type { TrackRecord } from "@/db/schema";
import type { PlaylistStrategy } from "@/features/playlists/strategy";
import type { MatchingIndex } from "@/features/library/summarization";

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

function mockMatchingIndex(
  trackFileId: string,
  normalizedGenres: string[]
): MatchingIndex {
  const trackMetadata = new Map();
  trackMetadata.set(trackFileId, {
    genres: normalizedGenres,
    normalizedGenres,
    artist: "Test Artist",
  });
  return {
    byGenre: new Map(),
    byArtist: new Map(),
    byTempoBucket: new Map(),
    byDurationBucket: new Map(),
    allTrackIds: new Set(),
    trackMetadata,
    genreMappings: {
      originalToNormalized: new Map(),
      normalizedToOriginals: new Map(),
    },
  };
}

function mockStrategy(overrides: Partial<PlaylistStrategy> = {}): PlaylistStrategy {
  return {
    title: "Test",
    description: "Test playlist for unit tests",
    constraints: {},
    scoringWeights: {
      genreMatch: 0.3,
      tempoMatch: 0.25,
      moodMatch: 0.2,
      activityMatch: 0.15,
      diversity: 0.1,
    },
    diversityRules: {
      maxTracksPerArtist: 3,
      artistSpacing: 5,
      genreSpacing: 3,
      maxTracksPerAlbum: 2,
    },
    orderingPlan: {
      sections: [{ name: "peak", startPosition: 0, endPosition: 1 }],
    },
    vibeTags: ["rock"],
    tempoGuidance: {},
    genreMixGuidance: {
      primaryGenres: ["Rock"],
      secondaryGenres: ["Jazz"],
      mixRatio: { primary: 0.7, secondary: 0.3 },
    },
    ...overrides,
  };
}

describe("calculateGenreMixFit", () => {
  it("returns score 1 when no genreMixGuidance", () => {
    const track = mockTrack({ trackFileId: "t1", tags: { ...mockTrack().tags, genres: ["Rock"] } });
    const strategy = mockStrategy({ genreMixGuidance: undefined });
    const index = mockMatchingIndex("t1", ["Rock"]);
    const result = calculateGenreMixFit(track, strategy, [mockTrack()], index);
    expect(result.score).toBe(1.0);
    expect(result.reasons).toEqual([]);
  });

  it("returns score 1 when no secondaryGenres", () => {
    const track = mockTrack({ trackFileId: "t1", tags: { ...mockTrack().tags, genres: ["Rock"] } });
    const strategy = mockStrategy({
      genreMixGuidance: {
        primaryGenres: ["Rock"],
        secondaryGenres: undefined,
        mixRatio: { primary: 0.7, secondary: 0.3 },
      },
    });
    const index = mockMatchingIndex("t1", ["Rock"]);
    const result = calculateGenreMixFit(track, strategy, [mockTrack()], index);
    expect(result.score).toBe(1.0);
  });

  it("boosts secondary-genre track when primary over ratio", () => {
    const primaryTrack = mockTrack({
      trackFileId: "p1",
      tags: { ...mockTrack().tags, genres: ["Rock"] },
    });
    const secondaryTrack = mockTrack({
      trackFileId: "s1",
      tags: { ...mockTrack().tags, genres: ["Jazz"] },
    });
    const strategy = mockStrategy();
    const index = mockMatchingIndex("s1", ["Jazz"]);
    index.trackMetadata.set("p1", {
      genres: ["Rock"],
      normalizedGenres: ["Rock"],
      artist: "Artist1",
    });
    const previousTracks = [primaryTrack, primaryTrack, primaryTrack, primaryTrack];
    const result = calculateGenreMixFit(secondaryTrack, strategy, previousTracks, index);
    expect(result.score).toBe(1.0);
    expect(result.reasons.some((r) => r.explanation.includes("secondary"))).toBe(true);
  });
});

describe("calculateDiversity", () => {
  it("applies penalty for repeated album when over maxTracksPerAlbum", () => {
    const albumTrack = mockTrack({
      trackFileId: "a1",
      tags: { ...mockTrack().tags, album: "Same Album", artist: "Artist1" },
    });
    const previousTracks = [
      mockTrack({ tags: { ...mockTrack().tags, album: "Same Album", artist: "Artist1" } }),
      mockTrack({ tags: { ...mockTrack().tags, album: "Same Album", artist: "Artist1" } }),
    ];
    const strategy = mockStrategy();
    const result = calculateDiversity(albumTrack, previousTracks, strategy);
    expect(result.score).toBeLessThan(1.0);
  });

  it("applies penalty when same decade appears frequently", () => {
    const track1985 = mockTrack({
      trackFileId: "y1",
      tags: { ...mockTrack().tags, year: 1985, artist: "Artist1" },
    });
    const previousTracks = [
      mockTrack({ tags: { ...mockTrack().tags, year: 1985, artist: "A" } }),
      mockTrack({ tags: { ...mockTrack().tags, year: 1986, artist: "B" } }),
      mockTrack({ tags: { ...mockTrack().tags, year: 1987, artist: "C" } }),
      mockTrack({ tags: { ...mockTrack().tags, year: 1988, artist: "D" } }),
    ];
    const strategy = mockStrategy();
    const result = calculateDiversity(track1985, previousTracks, strategy);
    expect(result.score).toBeLessThan(1.0);
  });
});

describe("calculateMoodMatch with new inference", () => {
  it("falls back to genre inference when mood tags missing", () => {
    const track = mockTrack({
      tags: { ...mockTrack().tags, genres: ["Ambient", "Chill"] },
      enhancedMetadata: {},
    });
    const request = {
      genres: [],
      length: { type: "tracks" as const, value: 10 },
      mood: ["Calm"],
      activity: [],
      tempo: {},
      surprise: 0.5,
    };
    const index = mockMatchingIndex("track-1", ["Ambient", "Chill"]);
    index.trackMetadata.get("track-1")!.tempoBucket = "unknown";
    const result = calculateMoodMatch(track, request, index);
    expect(result.score).toBeGreaterThanOrEqual(0.5);
    if (result.score > 0.5) {
      expect(result.reasons.some((r) => r.explanation.includes("Calm"))).toBe(true);
    }
  });
});

describe("calculateActivityMatch with new inference", () => {
  it("falls back to duration inference when activity tags and BPM missing", () => {
    const track = mockTrack({
      tags: { ...mockTrack().tags, genres: [] },
      tech: { durationSeconds: 150, bpm: undefined },
      enhancedMetadata: {},
    });
    const request = {
      genres: [],
      length: { type: "tracks" as const, value: 10 },
      mood: [],
      activity: ["Workout"],
      tempo: {},
      surprise: 0.5,
    };
    const result = calculateActivityMatch(track, request);
    expect(result.score).toBeGreaterThanOrEqual(0.5);
  });
});
