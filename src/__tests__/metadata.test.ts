/**
 * Tests for metadata normalization
 */

import { describe, it, expect } from "@jest/globals";
import {
  normalizeTitle,
  normalizeArtist,
  normalizeAlbum,
  normalizeGenres,
  normalizeYear,
} from "@/features/library/metadata";

describe("normalizeTitle", () => {
  it("should return trimmed title if provided", () => {
    expect(normalizeTitle("  Bohemian Rhapsody  ", "test.mp3")).toBe("Bohemian Rhapsody");
  });

  it("should fallback to filename without extension", () => {
    expect(normalizeTitle(undefined, "song.mp3")).toBe("song");
    expect(normalizeTitle("", "song.mp3")).toBe("song");
  });

  it("should handle filenames with multiple dots", () => {
    expect(normalizeTitle(undefined, "song.v2.mp3")).toBe("song.v2");
  });

  it("should handle empty filename", () => {
    expect(normalizeTitle(undefined, "")).toBe("");
  });
});

describe("normalizeArtist", () => {
  it("should return trimmed artist if provided", () => {
    expect(normalizeArtist("  Queen  ")).toBe("Queen");
  });

  it("should return 'Unknown Artist' if not provided", () => {
    expect(normalizeArtist(undefined)).toBe("Unknown Artist");
    expect(normalizeArtist("")).toBe("Unknown Artist");
    expect(normalizeArtist("   ")).toBe("Unknown Artist");
  });
});

describe("normalizeAlbum", () => {
  it("should return trimmed album if provided", () => {
    expect(normalizeAlbum("  A Night at the Opera  ")).toBe("A Night at the Opera");
  });

  it("should return 'Unknown Album' if not provided", () => {
    expect(normalizeAlbum(undefined)).toBe("Unknown Album");
    expect(normalizeAlbum("")).toBe("Unknown Album");
  });
});

describe("normalizeGenres", () => {
  it("should handle array of genres", () => {
    expect(normalizeGenres(["Rock", "Pop"])).toEqual(["Rock", "Pop"]);
  });

  it("should handle single string genre", () => {
    expect(normalizeGenres("Rock")).toEqual(["Rock"]);
  });

  it("should deduplicate genres", () => {
    expect(normalizeGenres(["Rock", "Rock", "Pop"])).toEqual(["Rock", "Pop"]);
  });

  it("should trim genre strings", () => {
    expect(normalizeGenres(["  Rock  ", " Pop "])).toEqual(["Rock", "Pop"]);
  });

  it("should return empty array if not provided", () => {
    expect(normalizeGenres(undefined)).toEqual([]);
    expect(normalizeGenres([])).toEqual([]);
  });

  it("should filter out empty genres", () => {
    expect(normalizeGenres(["Rock", "", "Pop", "   "])).toEqual(["Rock", "Pop"]);
  });
});

describe("normalizeYear", () => {
  it("should return valid year", () => {
    expect(normalizeYear(1975)).toBe(1975);
    expect(normalizeYear(2024)).toBe(2024);
  });

  it("should return undefined for invalid years", () => {
    expect(normalizeYear(0)).toBeUndefined();
    expect(normalizeYear(1800)).toBeUndefined(); // Too old
    expect(normalizeYear(2100)).toBeUndefined(); // Too far in future
  });

  it("should return undefined if not provided", () => {
    expect(normalizeYear(undefined)).toBeUndefined();
  });
});

