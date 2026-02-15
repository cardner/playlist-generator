import { describe, it, expect } from "@jest/globals";
import {
  getDecadeFromYear,
  inferMoodFromYear,
  inferActivityFromYear,
} from "@/lib/year-mapping";

describe("year-mapping", () => {
  describe("getDecadeFromYear", () => {
    it("returns null for invalid years", () => {
      expect(getDecadeFromYear(undefined)).toBeNull();
      expect(getDecadeFromYear(NaN)).toBeNull();
      expect(getDecadeFromYear(1899)).toBeNull();
      expect(getDecadeFromYear(2100)).toBeNull();
    });

    it("maps years to correct decades", () => {
      expect(getDecadeFromYear(1965)).toBe("60s");
      expect(getDecadeFromYear(1975)).toBe("70s");
      expect(getDecadeFromYear(1985)).toBe("80s");
      expect(getDecadeFromYear(1995)).toBe("90s");
      expect(getDecadeFromYear(2005)).toBe("2000s");
      expect(getDecadeFromYear(2015)).toBe("2010s");
      expect(getDecadeFromYear(2023)).toBe("2020s");
    });

    it("handles boundary years", () => {
      expect(getDecadeFromYear(1970)).toBe("70s");
      expect(getDecadeFromYear(1969)).toBe("60s");
      expect(getDecadeFromYear(2020)).toBe("2020s");
      expect(getDecadeFromYear(2019)).toBe("2010s");
    });
  });

  describe("inferMoodFromYear", () => {
    it("returns empty array for invalid years", () => {
      expect(inferMoodFromYear(undefined)).toEqual([]);
      expect(inferMoodFromYear(NaN)).toEqual([]);
    });

    it("returns mood categories for valid years", () => {
      const result80s = inferMoodFromYear(1985);
      expect(result80s.length).toBeGreaterThan(0);
      expect(result80s).toContain("Nostalgic");
    });

    it("returns canonical mood categories", () => {
      const result = inferMoodFromYear(1975);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((m) => m[0] === m[0].toUpperCase())).toBe(true);
    });
  });

  describe("inferActivityFromYear", () => {
    it("returns empty array for invalid years", () => {
      expect(inferActivityFromYear(undefined)).toEqual([]);
      expect(inferActivityFromYear(NaN)).toEqual([]);
    });

    it("returns activity categories for valid years", () => {
      const result80s = inferActivityFromYear(1985);
      expect(result80s.length).toBeGreaterThan(0);
      expect(result80s).toContain("Dance");
    });

    it("returns canonical activity categories", () => {
      const result = inferActivityFromYear(1995);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((a) => a[0] === a[0].toUpperCase())).toBe(true);
    });
  });
});
