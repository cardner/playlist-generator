import { describe, it, expect } from "@jest/globals";
import {
  getSimilarGenres,
  createGenreCoOccurrenceAccumulator,
  type GenreCoOccurrenceMap,
} from "@/features/library/genre-similarity";

function makeCoOccurrence(
  pairs: Array<[string, string, number]>
): GenreCoOccurrenceMap {
  const map: GenreCoOccurrenceMap = new Map();
  for (const [g1, g2, count] of pairs) {
    if (!map.has(g1)) map.set(g1, new Map());
    if (!map.has(g2)) map.set(g2, new Map());
    map.get(g1)!.set(g2, (map.get(g1)!.get(g2) ?? 0) + count);
    map.get(g2)!.set(g1, (map.get(g2)!.get(g1) ?? 0) + count);
  }
  return map;
}

describe("getSimilarGenres", () => {
  const libraryGenres = ["Rock", "Indie Rock", "Alternative Rock", "Punk", "Jazz", "Classical"];

  it("returns co-occurrence based suggestions when data exists", () => {
    const coOccurrence = makeCoOccurrence([
      ["Rock", "Indie Rock", 50],
      ["Rock", "Alternative Rock", 30],
      ["Rock", "Punk", 10],
    ]);
    const result = getSimilarGenres(["Rock"], libraryGenres, coOccurrence, 6);
    expect(result).toContain("Indie Rock");
    expect(result).toContain("Alternative Rock");
    expect(result).toContain("Punk");
    expect(result[0]).toBe("Indie Rock"); // highest co-occurrence first
  });

  it("excludes already selected genres", () => {
    const coOccurrence = makeCoOccurrence([
      ["Rock", "Indie Rock", 50],
      ["Rock", "Alternative Rock", 30],
    ]);
    const result = getSimilarGenres(
      ["Rock", "Indie Rock"],
      libraryGenres,
      coOccurrence,
      6
    );
    expect(result).not.toContain("Indie Rock");
    expect(result).toContain("Alternative Rock");
  });

  it("filters to library genres only", () => {
    const coOccurrence = makeCoOccurrence([
      ["Rock", "Metal", 100],
      ["Rock", "Indie Rock", 5],
    ]);
    const result = getSimilarGenres(["Rock"], libraryGenres, coOccurrence, 6);
    expect(result).not.toContain("Metal");
    expect(result).toContain("Indie Rock");
  });

  it("returns empty array when no genres selected", () => {
    const coOccurrence = makeCoOccurrence([["Rock", "Indie Rock", 50]]);
    const result = getSimilarGenres([], libraryGenres, coOccurrence, 6);
    expect(result).toEqual([]);
  });

  it("falls back to static taxonomy when co-occurrence is sparse", () => {
    const coOccurrence = new Map<string, Map<string, number>>();
    const result = getSimilarGenres(["Rock"], libraryGenres, coOccurrence, 6);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("Indie Rock");
  });

  it("respects limit parameter", () => {
    const coOccurrence = makeCoOccurrence([
      ["Rock", "Indie Rock", 50],
      ["Rock", "Alternative Rock", 40],
      ["Rock", "Punk", 30],
    ]);
    const result = getSimilarGenres(["Rock"], libraryGenres, coOccurrence, 2);
    expect(result).toHaveLength(2);
    expect(result).toEqual(["Indie Rock", "Alternative Rock"]);
  });
});

describe("createGenreCoOccurrenceAccumulator", () => {
  it("counts genre pairs on tracks with multiple genres", () => {
    const acc = createGenreCoOccurrenceAccumulator();
    acc.addTrack({
      tags: { genres: ["Rock", "Indie Rock"] },
      trackFileId: "t1",
    });
    acc.addTrack({
      tags: { genres: ["Rock", "Indie Rock"] },
      trackFileId: "t2",
    });
    acc.addTrack({
      tags: { genres: ["Rock", "Punk"] },
      trackFileId: "t3",
    });
    const map = acc.finalize();
    expect(map.get("Rock")?.get("Indie Rock")).toBe(2);
    expect(map.get("Rock")?.get("Punk")).toBe(1);
  });

  it("ignores tracks with single genre", () => {
    const acc = createGenreCoOccurrenceAccumulator();
    acc.addTrack({
      tags: { genres: ["Rock"] },
      trackFileId: "t1",
    });
    const map = acc.finalize();
    expect(map.size).toBe(0);
  });
});
