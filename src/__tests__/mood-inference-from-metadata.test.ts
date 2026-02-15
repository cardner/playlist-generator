import { describe, it, expect } from "@jest/globals";
import { inferMoodFromGenres } from "@/features/library/mood-inference-from-metadata";

describe("mood-inference-from-metadata", () => {
  describe("inferMoodFromGenres", () => {
    it("returns empty array for empty genres", () => {
      expect(inferMoodFromGenres([])).toEqual([]);
      expect(inferMoodFromGenres(undefined as unknown as string[])).toEqual([]);
    });

    it("maps ambient/chill genres to Calm, Dreamy", () => {
      const result = inferMoodFromGenres(["Ambient", "Chill Out"]);
      expect(result).toContain("Calm");
      expect(result).toContain("Dreamy");
    });

    it("maps metal/punk genres to Intense, Aggressive", () => {
      const result = inferMoodFromGenres(["Heavy Metal", "Punk Rock"]);
      expect(result).toContain("Intense");
      expect(result).toContain("Aggressive");
    });

    it("maps jazz/folk genres to Relaxed, Mellow", () => {
      const result = inferMoodFromGenres(["Jazz", "Folk"]);
      expect(result).toContain("Relaxed");
      expect(result).toContain("Mellow");
    });

    it("maps indie/acoustic genres to Reflective, Mellow", () => {
      const result = inferMoodFromGenres(["Indie Rock", "Acoustic"]);
      expect(result).toContain("Reflective");
      expect(result).toContain("Mellow");
    });

    it("maps edm/house genres to Energetic, Euphoric", () => {
      const result = inferMoodFromGenres(["EDM", "House", "Techno"]);
      expect(result).toContain("Energetic");
      expect(result).toContain("Euphoric");
    });

    it("maps disco/funk genres to Upbeat, Happy", () => {
      const result = inferMoodFromGenres(["Disco", "Funk"]);
      expect(result).toContain("Upbeat");
      expect(result).toContain("Happy");
    });

    it("maps synthwave to Nostalgic, Dreamy", () => {
      const result = inferMoodFromGenres(["Synthwave", "New Wave"]);
      expect(result).toContain("Nostalgic");
      expect(result).toContain("Dreamy");
    });

    it("returns canonical mood categories", () => {
      const result = inferMoodFromGenres(["ambient"]);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((m) => m[0] === m[0].toUpperCase())).toBe(true);
    });

    it("returns empty for unknown genres", () => {
      const result = inferMoodFromGenres(["unknownxyz", "xyzgenre"]);
      expect(result).toEqual([]);
    });
  });
});
