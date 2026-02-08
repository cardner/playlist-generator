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
  normalizeIsrc,
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

describe("normalizeIsrc", () => {
  it("should normalize valid ISRC with hyphens", () => {
    expect(normalizeIsrc("US-ABC-12-34567")).toBe("USABC1234567");
  });

  it("should normalize valid ISRC without hyphens", () => {
    expect(normalizeIsrc("USABC1234567")).toBe("USABC1234567");
  });

  it("should convert to uppercase", () => {
    expect(normalizeIsrc("us-abc-12-34567")).toBe("USABC1234567");
    expect(normalizeIsrc("usabc1234567")).toBe("USABC1234567");
  });

  it("should trim whitespace", () => {
    expect(normalizeIsrc("  USABC1234567  ")).toBe("USABC1234567");
    expect(normalizeIsrc("  US-ABC-12-34567  ")).toBe("USABC1234567");
  });

  it("should return undefined for ISRCs shorter than 12 characters", () => {
    expect(normalizeIsrc("US-ABC-12")).toBeUndefined(); // 8 chars without hyphens
    expect(normalizeIsrc("USABC12")).toBeUndefined(); // 7 chars
    expect(normalizeIsrc("")).toBeUndefined();
  });

  it("should return undefined for ISRCs longer than 12 characters", () => {
    expect(normalizeIsrc("USABC12345678")).toBeUndefined(); // 13 chars
    expect(normalizeIsrc("US-ABC-12-345678")).toBeUndefined(); // 13 chars without hyphens
  });

  it("should return undefined for ISRCs with invalid characters", () => {
    expect(normalizeIsrc("US-ABC-12-3456!")).toBeUndefined();
    expect(normalizeIsrc("US-ABC-12-3456@")).toBeUndefined();
    expect(normalizeIsrc("US ABC 12 34567")).toBeUndefined(); // spaces don't count as valid
  });

  it("should return undefined for null or undefined input", () => {
    expect(normalizeIsrc(undefined)).toBeUndefined();
    expect(normalizeIsrc(null)).toBeUndefined();
  });

  it("should handle array input and use first element", () => {
    expect(normalizeIsrc(["US-ABC-12-34567", "GB-XYZ-11-11111"])).toBe("USABC1234567");
  });

  it("should return undefined for empty array", () => {
    expect(normalizeIsrc([])).toBeUndefined();
  });

  it("should accept alphanumeric ISRCs", () => {
    expect(normalizeIsrc("GB12A3456789")).toBe("GB12A3456789");
    expect(normalizeIsrc("US1BC1234567")).toBe("US1BC1234567");
  });

  it("should validate real-world ISRCs", () => {
    // Real ISRC examples
    expect(normalizeIsrc("USRC17607839")).toBe("USRC17607839");
    expect(normalizeIsrc("GBAYE0601477")).toBe("GBAYE0601477");
    expect(normalizeIsrc("FRZ039800212")).toBe("FRZ039800212");
  });
});

