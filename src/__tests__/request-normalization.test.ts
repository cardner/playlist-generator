import { describe, it, expect } from "@jest/globals";
import { normalizePlaylistRequest } from "@/features/playlists/request-normalization";
import type { PlaylistRequest } from "@/types/playlist";

const baseRequest: PlaylistRequest = {
  genres: ["rock"],
  length: { type: "minutes", value: 30 },
  mood: ["energetic"],
  activity: ["workout"],
  tempo: { bucket: "medium" },
  surprise: 0.5,
};

describe("normalizePlaylistRequest", () => {
  describe("sourcePool and recentWindow", () => {
    it("defaults sourcePool to 'all' when missing", () => {
      const result = normalizePlaylistRequest(baseRequest);
      expect(result.sourcePool).toBe("all");
    });

    it("sets sourcePool to 'recent' when provided", () => {
      const result = normalizePlaylistRequest({
        ...baseRequest,
        sourcePool: "recent",
      });
      expect(result.sourcePool).toBe("recent");
    });

    it("defaults recentWindow to '30d' when sourcePool is 'recent' and recentWindow missing", () => {
      const result = normalizePlaylistRequest({
        ...baseRequest,
        sourcePool: "recent",
        // recentWindow and recentTrackCount omitted
      });
      expect(result.recentWindow).toBe("30d");
    });

    it("does not override recentWindow when sourcePool is recent and recentWindow provided", () => {
      const result = normalizePlaylistRequest({
        ...baseRequest,
        sourcePool: "recent",
        recentWindow: "7d",
      });
      expect(result.recentWindow).toBe("7d");
    });

    it("does not set recentWindow when recentTrackCount is provided (alternative to window)", () => {
      const result = normalizePlaylistRequest({
        ...baseRequest,
        sourcePool: "recent",
        recentTrackCount: 50,
      });
      expect(result.recentTrackCount).toBe(50);
      // recentWindow stays as request.recentWindow (undefined) - normalization
      // only sets it when both recentWindow and recentTrackCount are missing
      expect(result.recentWindow).toBeUndefined();
    });
  });

  describe("mood and activity normalization", () => {
    it("normalizes new mood synonyms to canonical categories", () => {
      const result = normalizePlaylistRequest({
        ...baseRequest,
        mood: ["romantic", "dreamy", "uplifting"],
        activity: ["workout"],
      });
      expect(result.mood).toContain("Romantic");
      expect(result.mood).toContain("Dreamy");
      expect(result.mood).toContain("Uplifting");
    });

    it("normalizes new activity synonyms to canonical categories", () => {
      const result = normalizePlaylistRequest({
        ...baseRequest,
        mood: ["energetic"],
        activity: ["yoga", "gaming", "cleaning", "cycling"],
      });
      expect(result.activity).toContain("Yoga");
      expect(result.activity).toContain("Gaming");
      expect(result.activity).toContain("Cleaning");
      expect(result.activity).toContain("Cycling");
    });
  });
});
