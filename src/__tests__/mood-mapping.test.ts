import { describe, it, expect } from "@jest/globals";
import {
  getMoodCategories,
  mapMoodTagsToCategories,
  mapMusicBrainzTagsToMood,
  normalizeMoodCategory,
} from "@/features/library/mood-mapping";

describe("mood-mapping", () => {
  describe("getMoodCategories", () => {
    it("returns all canonical mood categories including new ones", () => {
      const categories = getMoodCategories();
      expect(categories).toContain("Romantic");
      expect(categories).toContain("Dark");
      expect(categories).toContain("Nostalgic");
      expect(categories).toContain("Dreamy");
      expect(categories).toContain("Aggressive");
      expect(categories).toContain("Uplifting");
      expect(categories).toContain("Reflective");
      expect(categories).toContain("Euphoric");
      expect(categories.length).toBeGreaterThanOrEqual(18);
    });
  });

  describe("mapMoodTagsToCategories", () => {
    it("maps romantic synonyms to Romantic", () => {
      expect(mapMoodTagsToCategories(["romantic", "love"])).toContain("Romantic");
    });

    it("maps dark synonyms to Dark", () => {
      expect(mapMoodTagsToCategories(["dark", "brooding"])).toContain("Dark");
    });

    it("maps nostalgic synonyms to Nostalgic", () => {
      expect(mapMoodTagsToCategories(["nostalgic", "retro"])).toContain("Nostalgic");
    });

    it("maps dreamy synonyms to Dreamy", () => {
      expect(mapMoodTagsToCategories(["dreamy", "ethereal"])).toContain("Dreamy");
    });

    it("maps aggressive synonyms to Aggressive", () => {
      expect(mapMoodTagsToCategories(["aggressive", "angry"])).toContain("Aggressive");
    });

    it("maps uplifting synonyms to Uplifting", () => {
      expect(mapMoodTagsToCategories(["uplifting", "inspiring"])).toContain("Uplifting");
    });

    it("maps reflective synonyms to Reflective", () => {
      expect(mapMoodTagsToCategories(["reflective", "contemplative"])).toContain(
        "Reflective"
      );
    });

    it("maps euphoric synonyms to Euphoric", () => {
      expect(mapMoodTagsToCategories(["euphoric", "ecstatic"])).toContain("Euphoric");
    });
  });

  describe("normalizeMoodCategory", () => {
    it("normalizes new mood categories", () => {
      expect(normalizeMoodCategory("romantic")).toBe("Romantic");
      expect(normalizeMoodCategory("dark")).toBe("Dark");
      expect(normalizeMoodCategory("nostalgic")).toBe("Nostalgic");
      expect(normalizeMoodCategory("dreamy")).toBe("Dreamy");
      expect(normalizeMoodCategory("aggressive")).toBe("Aggressive");
      expect(normalizeMoodCategory("uplifting")).toBe("Uplifting");
      expect(normalizeMoodCategory("reflective")).toBe("Reflective");
      expect(normalizeMoodCategory("euphoric")).toBe("Euphoric");
    });

    it("returns null for unknown moods", () => {
      expect(normalizeMoodCategory("unknownxyz")).toBeNull();
    });
  });

  describe("mapMusicBrainzTagsToMood", () => {
    it("returns empty array for empty tags", () => {
      expect(mapMusicBrainzTagsToMood([])).toEqual([]);
      expect(mapMusicBrainzTagsToMood(undefined as unknown as string[])).toEqual([]);
    });

    it("maps MusicBrainz tags that overlap with mood keywords", () => {
      expect(mapMusicBrainzTagsToMood(["sad", "melancholic"])).toContain("Melancholic");
      expect(mapMusicBrainzTagsToMood(["energetic", "anthemic"])).toContain("Energetic");
      expect(mapMusicBrainzTagsToMood(["chill", "calm"])).toContain("Calm");
    });
  });
});
