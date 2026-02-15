import { describe, it, expect } from "@jest/globals";
import { buildPrompt } from "@/features/playlists/strategy";
import type { PlaylistRequest } from "@/types/playlist";
import type { LibrarySummary } from "@/features/library/summarization";
import type { AppSettings } from "@/lib/settings";

const minimalSummary: LibrarySummary = {
  totalTracks: 100,
  genreCounts: [
    { genre: "Rock", count: 40 },
    { genre: "Pop", count: 30 },
  ],
  tempoDistribution: { slow: 20, medium: 50, fast: 30, unknown: 0 },
  durationStats: { min: 120, max: 360, avg: 240, total: 24000 },
  recentlyAdded: { last24Hours: 0, last7Days: 5, last30Days: 20 },
};

const defaultSettings: AppSettings = {
  allowLLM: false,
  allowSendingTrackNamesToLLM: false,
};

function minimalRequest(overrides: Partial<PlaylistRequest> = {}): PlaylistRequest {
  return {
    genres: ["rock"],
    length: { type: "minutes", value: 30 },
    mood: ["energetic"],
    activity: ["workout"],
    tempo: { bucket: "medium" },
    surprise: 0.5,
    ...overrides,
  };
}

describe("buildPrompt", () => {
  it("includes USER REQUEST and LIBRARY SUMMARY", () => {
    const request = minimalRequest();
    const prompt = buildPrompt(request, minimalSummary, defaultSettings);
    expect(prompt).toContain("USER REQUEST:");
    expect(prompt).toContain("LIBRARY SUMMARY:");
    expect(prompt).toContain("" + minimalSummary.totalTracks);
    expect(prompt).toContain("Rock");
  });

  it("does not include ADDITIONAL USER INSTRUCTIONS when llmAdditionalInstructions is missing", () => {
    const request = minimalRequest();
    const prompt = buildPrompt(request, minimalSummary, defaultSettings);
    expect(prompt).not.toContain("ADDITIONAL USER INSTRUCTIONS");
    expect(prompt).not.toContain("Incorporates any ADDITIONAL USER INSTRUCTIONS");
  });

  it("does not include ADDITIONAL USER INSTRUCTIONS when llmAdditionalInstructions is empty string", () => {
    const request = minimalRequest({ llmAdditionalInstructions: "" });
    const prompt = buildPrompt(request, minimalSummary, defaultSettings);
    expect(prompt).not.toContain("ADDITIONAL USER INSTRUCTIONS");
    expect(prompt).not.toContain("Incorporates any ADDITIONAL USER INSTRUCTIONS");
  });

  it("does not include ADDITIONAL USER INSTRUCTIONS when llmAdditionalInstructions is whitespace only", () => {
    const request = minimalRequest({ llmAdditionalInstructions: "   \n\t  " });
    const prompt = buildPrompt(request, minimalSummary, defaultSettings);
    expect(prompt).not.toContain("ADDITIONAL USER INSTRUCTIONS");
    expect(prompt).not.toContain("Incorporates any ADDITIONAL USER INSTRUCTIONS");
  });

  it("includes ADDITIONAL USER INSTRUCTIONS section and user text when llmAdditionalInstructions is set", () => {
    const instructions = "favor 80s production, no ballads";
    const request = minimalRequest({ llmAdditionalInstructions: instructions });
    const prompt = buildPrompt(request, minimalSummary, defaultSettings);
    expect(prompt).toContain("ADDITIONAL USER INSTRUCTIONS");
    expect(prompt).toContain(instructions);
    expect(prompt).toContain("incorporate these into the strategy");
  });

  it("includes 6th bullet about incorporating additional instructions when llmAdditionalInstructions is set", () => {
    const request = minimalRequest({ llmAdditionalInstructions: "more variety" });
    const prompt = buildPrompt(request, minimalSummary, defaultSettings);
    expect(prompt).toContain("6. Incorporates any ADDITIONAL USER INSTRUCTIONS above while still returning only valid JSON.");
  });

  it("trims llmAdditionalInstructions before including in prompt", () => {
    const request = minimalRequest({
      llmAdditionalInstructions: "  no ballads  ",
    });
    const prompt = buildPrompt(request, minimalSummary, defaultSettings);
    expect(prompt).toContain("no ballads");
    expect(prompt).not.toMatch(/  no ballads  /);
  });
});
