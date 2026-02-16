/**
 * Unit tests for generateReplacementTracks
 */

import { describe, it, expect } from "@jest/globals";
import { generateReplacementTracks } from "@/features/playlists/matching-engine";
import type { TrackRecord } from "@/db/schema";
import type { PlaylistRequest } from "@/types/playlist";
import type { PlaylistStrategy } from "@/features/playlists/strategy";
import type { MatchingIndex } from "@/features/library/summarization";
import type { TrackSelection } from "@/features/playlists";

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
      discNo: undefined,
    },
    tech: { durationSeconds: 180, bpm: 120 },
    updatedAt: Date.now(),
    ...overrides,
  } as TrackRecord;
}

function mockRequest(overrides: Partial<PlaylistRequest> = {}): PlaylistRequest {
  return {
    genres: ["Rock"],
    mood: [],
    activity: [],
    length: { type: "tracks" as const, value: 10 },
    tempo: {},
    surprise: 0,
    ...overrides,
  };
}

function mockStrategy(
  overrides: Partial<PlaylistStrategy> = {}
): PlaylistStrategy {
  return {
    title: "Test",
    description: "Test",
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
    vibeTags: [],
    tempoGuidance: {},
    genreMixGuidance: {
      primaryGenres: ["Rock"],
      secondaryGenres: [],
      mixRatio: { primary: 1, secondary: 0 },
    },
    ...overrides,
  } as PlaylistStrategy;
}

function mockMatchingIndex(trackIds: string[]): MatchingIndex {
  const byGenre = new Map<string, string[]>();
  byGenre.set("Rock", trackIds);
  const allTrackIds = new Set(trackIds);
  const trackMetadata = new Map();
  for (const id of trackIds) {
    trackMetadata.set(id, {
      genres: ["Rock"],
      normalizedGenres: ["rock"],
      artist: "Artist",
      tempoBucket: "medium",
    });
  }
  return {
    byGenre,
    byArtist: new Map(),
    byTempoBucket: new Map(),
    byDurationBucket: new Map(),
    allTrackIds,
    trackMetadata,
    genreMappings: {
      originalToNormalized: new Map(),
      normalizedToOriginals: new Map(),
    },
  };
}

function selectionFromTrack(track: TrackRecord): TrackSelection {
  return {
    trackFileId: track.trackFileId,
    track,
    score: 0.8,
    reasons: [],
    genreMatch: 0.8,
    tempoMatch: 0.8,
    moodMatch: 0.5,
    activityMatch: 0.5,
    durationFit: 0.8,
    diversity: 0.7,
    surprise: 0.3,
  };
}

describe("generateReplacementTracks", () => {
  it("returns correct count of replacement tracks", () => {
    const track1 = mockTrack({ trackFileId: "t1" });
    const track2 = mockTrack({ trackFileId: "t2" });
    const track3 = mockTrack({ trackFileId: "t3" });
    const allTracks = [track1, track2, track3];
    const index = mockMatchingIndex(["t1", "t2", "t3"]);
    const contextSelections = [selectionFromTrack(track1)];

    const result = generateReplacementTracks(
      mockRequest(),
      mockStrategy(),
      index,
      allTracks,
      1,
      contextSelections,
      [],
      "test-seed"
    );

    expect(result).toHaveLength(1);
    expect(result[0].trackFileId).not.toBe("t1");
    expect(["t2", "t3"]).toContain(result[0].trackFileId);
  });

  it("excludes context track IDs from results", () => {
    const track1 = mockTrack({ trackFileId: "t1" });
    const track2 = mockTrack({ trackFileId: "t2" });
    const allTracks = [track1, track2];
    const index = mockMatchingIndex(["t1", "t2"]);
    const contextSelections = [
      selectionFromTrack(track1),
      selectionFromTrack(track2),
    ];

    const result = generateReplacementTracks(
      mockRequest(),
      mockStrategy(),
      index,
      allTracks,
      1,
      contextSelections,
      [],
      "seed"
    );

    expect(result).toHaveLength(0);
  });

  it("excludes excludeTrackIds from results", () => {
    const track1 = mockTrack({ trackFileId: "t1" });
    const track2 = mockTrack({ trackFileId: "t2" });
    const track3 = mockTrack({ trackFileId: "t3" });
    const allTracks = [track1, track2, track3];
    const index = mockMatchingIndex(["t1", "t2", "t3"]);
    const contextSelections = [selectionFromTrack(track1)];

    const result = generateReplacementTracks(
      mockRequest(),
      mockStrategy(),
      index,
      allTracks,
      1,
      contextSelections,
      ["t2"],
      "seed"
    );

    expect(result).toHaveLength(1);
    expect(result[0].trackFileId).toBe("t3");
  });

  it("returns empty array when no candidates", () => {
    const track1 = mockTrack({ trackFileId: "t1" });
    const allTracks = [track1];
    const index = mockMatchingIndex(["t1"]);
    const contextSelections = [selectionFromTrack(track1)];

    const result = generateReplacementTracks(
      mockRequest(),
      mockStrategy(),
      index,
      allTracks,
      1,
      contextSelections,
      [],
      "seed"
    );

    expect(result).toHaveLength(0);
  });

  it("is deterministic with same seed", () => {
    const tracks = Array.from({ length: 5 }, (_, i) =>
      mockTrack({ trackFileId: `t${i}` })
    );
    const index = mockMatchingIndex(tracks.map((t) => t.trackFileId));
    const contextSelections = [selectionFromTrack(tracks[0])];

    const result1 = generateReplacementTracks(
      mockRequest(),
      mockStrategy(),
      index,
      tracks,
      1,
      contextSelections,
      [],
      "deterministic-seed"
    );
    const result2 = generateReplacementTracks(
      mockRequest(),
      mockStrategy(),
      index,
      tracks,
      1,
      contextSelections,
      [],
      "deterministic-seed"
    );

    expect(result1).toHaveLength(1);
    expect(result2).toHaveLength(1);
    expect(result1[0].trackFileId).toBe(result2[0].trackFileId);
  });

  it("returns up to count tracks", () => {
    const tracks = Array.from({ length: 5 }, (_, i) =>
      mockTrack({ trackFileId: `t${i}` })
    );
    const index = mockMatchingIndex(tracks.map((t) => t.trackFileId));
    const contextSelections = [selectionFromTrack(tracks[0])];

    const result = generateReplacementTracks(
      mockRequest(),
      mockStrategy(),
      index,
      tracks,
      2,
      contextSelections,
      [],
      "seed"
    );

    expect(result.length).toBeLessThanOrEqual(2);
    const ids = new Set(result.map((r) => r.trackFileId));
    expect(ids.size).toBe(result.length);
    expect(ids.has("t0")).toBe(false);
  });
});
