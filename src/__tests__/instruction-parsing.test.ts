import { describe, it, expect } from "@jest/globals";
import {
  extractInstructionTokens,
  parseMoodFromInstructions,
  parseActivityFromInstructions,
  parseGenresFromInstructions,
  parseStrategyHintsFromInstructions,
  applyInstructionHintsToRequest,
  mergeInstructionsIntoRequest,
} from "@/features/playlists/instruction-parsing";
import type { PlaylistRequest } from "@/types/playlist";

describe("instruction-parsing", () => {
  describe("extractInstructionTokens", () => {
    it("returns empty array for empty or whitespace input", () => {
      expect(extractInstructionTokens("")).toEqual([]);
      expect(extractInstructionTokens("   ")).toEqual([]);
      expect(extractInstructionTokens(undefined as unknown as string)).toEqual([]);
    });

    it("extracts words and filters stopwords", () => {
      const tokens = extractInstructionTokens("I want energetic chill music for the gym");
      expect(tokens).toContain("energetic");
      expect(tokens).toContain("chill");
      expect(tokens).toContain("gym");
      expect(tokens).not.toContain("i");
      expect(tokens).not.toContain("the");
    });

    it("includes 2-word phrases", () => {
      const tokens = extractInstructionTokens("more variety road trip");
      expect(tokens.some((t) => t.includes("variety") || t.includes("road"))).toBe(true);
    });

    it("filters short tokens", () => {
      const tokens = extractInstructionTokens("no ok yes");
      expect(tokens.every((t) => t.length >= 2)).toBe(true);
    });
  });

  describe("parseMoodFromInstructions", () => {
    it("returns empty for empty input", () => {
      expect(parseMoodFromInstructions("")).toEqual([]);
      expect(parseMoodFromInstructions(undefined)).toEqual([]);
    });

    it("maps mood keywords to canonical categories", () => {
      const result = parseMoodFromInstructions("chill relaxed calm vibes");
      expect(result).toContain("Relaxed");
      expect(result).toContain("Calm");
    });

    it("maps energetic to Energetic", () => {
      const result = parseMoodFromInstructions("energetic upbeat");
      expect(result).toContain("Energetic");
      expect(result).toContain("Upbeat");
    });
  });

  describe("parseActivityFromInstructions", () => {
    it("returns empty for empty input", () => {
      expect(parseActivityFromInstructions("")).toEqual([]);
    });

    it("maps activity keywords to canonical categories", () => {
      const result = parseActivityFromInstructions("workout gym running study focus");
      expect(result).toContain("Workout");
      expect(result).toContain("Running");
      expect(result).toContain("Study");
    });

    it("maps chill to Relaxing", () => {
      const result = parseActivityFromInstructions("chill relax");
      expect(result).toContain("Relaxing");
    });
  });

  describe("parseGenresFromInstructions", () => {
    it("returns empty when knownGenres not provided", () => {
      const result = parseGenresFromInstructions("rock indie jazz");
      expect(result).toEqual([]);
    });

    it("returns only tokens that match known genres", () => {
      const knownGenres = ["Rock", "Indie", "Pop"];
      const result = parseGenresFromInstructions("rock indie jazz unknown", knownGenres);
      expect(result).toContain("rock");
      expect(result).toContain("indie");
      expect(result).not.toContain("jazz");
      expect(result).not.toContain("unknown");
    });
  });

  describe("parseStrategyHintsFromInstructions", () => {
    it("returns empty object for empty input", () => {
      expect(parseStrategyHintsFromInstructions("")).toEqual({});
      expect(parseStrategyHintsFromInstructions(undefined)).toEqual({});
    });

    it("detects fast tempo hint", () => {
      expect(parseStrategyHintsFromInstructions("no slow songs").tempoBucket).toBe("fast");
      expect(parseStrategyHintsFromInstructions("upbeat only").tempoBucket).toBe("fast");
    });

    it("detects slow tempo hint", () => {
      expect(parseStrategyHintsFromInstructions("chill only").tempoBucket).toBe("slow");
      expect(parseStrategyHintsFromInstructions("relaxing only").tempoBucket).toBe("slow");
    });

    it("detects variety/diversity boost", () => {
      expect(parseStrategyHintsFromInstructions("more variety").surpriseBoost).toBe(0.2);
      expect(parseStrategyHintsFromInstructions("mix it up").surpriseBoost).toBe(0.2);
    });

    it("detects safe/predictable reduction", () => {
      expect(parseStrategyHintsFromInstructions("safe familiar").surpriseBoost).toBe(-0.2);
    });

    it("detects short tracks hint", () => {
      expect(parseStrategyHintsFromInstructions("short tracks only").maxDurationSeconds).toBe(180);
    });
  });

  describe("applyInstructionHintsToRequest", () => {
    const baseRequest: PlaylistRequest = {
      genres: ["rock"],
      length: { type: "minutes", value: 30 },
      mood: ["energetic"],
      activity: ["workout"],
      tempo: { bucket: "medium" },
      surprise: 0.5,
    };

    it("returns unchanged request when hints empty", () => {
      const result = applyInstructionHintsToRequest(baseRequest, {});
      expect(result).toEqual(baseRequest);
    });

    it("applies tempo bucket override when no bpmRange", () => {
      const result = applyInstructionHintsToRequest(baseRequest, {
        tempoBucket: "fast",
      });
      expect(result.tempo?.bucket).toBe("fast");
    });

    it("applies surprise boost", () => {
      const result = applyInstructionHintsToRequest(baseRequest, {
        surpriseBoost: 0.2,
      });
      expect(result.surprise).toBe(0.7);
    });

    it("clamps surprise to 0-1", () => {
      const result = applyInstructionHintsToRequest(baseRequest, {
        surpriseBoost: 0.8,
      });
      expect(result.surprise).toBe(1);
    });
  });

  describe("mergeInstructionsIntoRequest", () => {
    const baseRequest: PlaylistRequest = {
      genres: ["rock"],
      length: { type: "minutes", value: 30 },
      mood: ["energetic"],
      activity: ["workout"],
      tempo: { bucket: "medium" },
      surprise: 0.5,
    };

    it("returns unchanged request when instructions empty", () => {
      const result = mergeInstructionsIntoRequest(baseRequest);
      expect(result).toEqual(baseRequest);
    });

    it("merges parsed mood from instructions", () => {
      const result = mergeInstructionsIntoRequest({
        ...baseRequest,
        llmAdditionalInstructions: "chill relaxed",
      });
      expect(result.mood).toContain("energetic");
      expect(result.mood).toContain("Relaxed");
      expect(result.mood).toContain("Calm");
    });

    it("merges parsed activity from instructions", () => {
      const result = mergeInstructionsIntoRequest({
        ...baseRequest,
        llmAdditionalInstructions: "yoga meditation",
      });
      expect(result.activity).toContain("workout");
      expect(result.activity).toContain("Yoga");
      expect(result.activity).toContain("Meditation");
    });

    it("merges genres when knownGenres provided", () => {
      const result = mergeInstructionsIntoRequest(
        {
          ...baseRequest,
          llmAdditionalInstructions: "indie pop",
        },
        ["Rock", "Indie", "Pop"]
      );
      expect(result.genres).toContain("rock");
      expect(result.genres).toContain("indie");
      expect(result.genres).toContain("pop");
    });

    it("does not add unknown genres when knownGenres provided", () => {
      const result = mergeInstructionsIntoRequest(
        {
          ...baseRequest,
          llmAdditionalInstructions: "jazz blues",
        },
        ["Rock", "Pop"]
      );
      expect(result.genres).toEqual(["rock"]);
    });
  });
});
