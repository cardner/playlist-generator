import { describe, it, expect } from "@jest/globals";
import {
  getActivityCategories,
  mapActivityTagsToCategories,
  normalizeActivityCategory,
} from "@/features/library/activity-mapping";

describe("activity-mapping", () => {
  describe("getActivityCategories", () => {
    it("returns all canonical activity categories including new ones", () => {
      const categories = getActivityCategories();
      expect(categories).toContain("Yoga");
      expect(categories).toContain("Gaming");
      expect(categories).toContain("Creative");
      expect(categories).toContain("Cleaning");
      expect(categories).toContain("Walking");
      expect(categories).toContain("Cycling");
      expect(categories).toContain("Socializing");
      expect(categories).toContain("Gardening");
      expect(categories.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe("mapActivityTagsToCategories", () => {
    it("maps yoga synonyms to Yoga", () => {
      expect(mapActivityTagsToCategories(["yoga", "stretching"])).toContain("Yoga");
    });

    it("maps gaming synonyms to Gaming", () => {
      expect(mapActivityTagsToCategories(["gaming", "video games"])).toContain("Gaming");
    });

    it("maps creative synonyms to Creative", () => {
      expect(mapActivityTagsToCategories(["creative", "writing"])).toContain("Creative");
      expect(mapActivityTagsToCategories(["painting", "drawing"])).toContain("Creative");
    });

    it("maps cleaning synonyms to Cleaning", () => {
      expect(mapActivityTagsToCategories(["cleaning", "chores"])).toContain("Cleaning");
    });

    it("maps walking synonyms to Walking", () => {
      expect(mapActivityTagsToCategories(["walking", "hiking"])).toContain("Walking");
    });

    it("maps cycling synonyms to Cycling", () => {
      expect(mapActivityTagsToCategories(["cycling", "biking"])).toContain("Cycling");
    });

    it("maps socializing synonyms to Socializing", () => {
      expect(mapActivityTagsToCategories(["socializing", "hanging out"])).toContain(
        "Socializing"
      );
    });

    it("maps gardening synonyms to Gardening", () => {
      expect(mapActivityTagsToCategories(["gardening", "yard work"])).toContain(
        "Gardening"
      );
    });
  });

  describe("normalizeActivityCategory", () => {
    it("normalizes new activity categories", () => {
      expect(normalizeActivityCategory("yoga")).toBe("Yoga");
      expect(normalizeActivityCategory("gaming")).toBe("Gaming");
      expect(normalizeActivityCategory("creative")).toBe("Creative");
      expect(normalizeActivityCategory("cleaning")).toBe("Cleaning");
      expect(normalizeActivityCategory("walking")).toBe("Walking");
      expect(normalizeActivityCategory("cycling")).toBe("Cycling");
      expect(normalizeActivityCategory("socializing")).toBe("Socializing");
      expect(normalizeActivityCategory("gardening")).toBe("Gardening");
    });

    it("returns null for unknown activities", () => {
      expect(normalizeActivityCategory("unknownxyz")).toBeNull();
    });
  });
});
