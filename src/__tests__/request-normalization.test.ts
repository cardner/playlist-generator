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
});
