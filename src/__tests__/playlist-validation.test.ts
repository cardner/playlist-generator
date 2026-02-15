import { describe, it, expect } from "@jest/globals";
import {
  validatePlaylistRequest,
  hasErrors,
} from "@/lib/playlist-validation";
import { isValidPlaylistRequest } from "@/types/playlist";

const baseRequest = {
  genres: ["rock"],
  length: { type: "minutes" as const, value: 30 },
  mood: ["energetic"],
  activity: ["workout"],
  tempo: { bucket: "medium" as const },
  surprise: 0.5,
};

describe("validatePlaylistRequest", () => {
  it("requires genres, mood, activity when sourcePool is not recent", () => {
    const errors = validatePlaylistRequest({
      ...baseRequest,
      genres: [],
      mood: [],
      activity: [],
    });
    expect(errors.genres).toBeDefined();
    expect(errors.mood).toBeDefined();
    expect(errors.activity).toBeDefined();
    expect(hasErrors(errors)).toBe(true);
  });

  it("allows empty genre, mood, activity when sourcePool is recent", () => {
    const errors = validatePlaylistRequest({
      ...baseRequest,
      sourcePool: "recent",
      genres: [],
      mood: [],
      activity: [],
    });
    expect(errors.genres).toBeUndefined();
    expect(errors.mood).toBeUndefined();
    expect(errors.activity).toBeUndefined();
    expect(hasErrors(errors)).toBe(false);
  });

  it("allows undefined genres, mood, activity when sourcePool is recent", () => {
    const errors = validatePlaylistRequest({
      ...baseRequest,
      sourcePool: "recent",
      genres: undefined,
      mood: undefined,
      activity: undefined,
    });
    expect(errors.genres).toBeUndefined();
    expect(errors.mood).toBeUndefined();
    expect(errors.activity).toBeUndefined();
  });

  it("accepts llmAdditionalInstructions without validation errors", () => {
    const errors = validatePlaylistRequest({
      ...baseRequest,
      llmAdditionalInstructions: "favor 80s production, no ballads",
    });
    expect(hasErrors(errors)).toBe(false);
  });
});

describe("isValidPlaylistRequest", () => {
  it("rejects empty genres/mood/activity when sourcePool is not recent", () => {
    expect(
      isValidPlaylistRequest({
        ...baseRequest,
        genres: [],
        mood: [],
        activity: [],
      })
    ).toBe(false);
  });

  it("accepts empty genres/mood/activity when sourcePool is recent", () => {
    expect(
      isValidPlaylistRequest({
        ...baseRequest,
        sourcePool: "recent",
        genres: [],
        mood: [],
        activity: [],
      })
    ).toBe(true);
  });

  it("accepts undefined genres/mood/activity when sourcePool is recent", () => {
    expect(
      isValidPlaylistRequest({
        ...baseRequest,
        sourcePool: "recent",
        genres: undefined,
        mood: undefined,
        activity: undefined,
      })
    ).toBe(true);
  });
});
