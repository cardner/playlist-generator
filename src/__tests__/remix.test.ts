import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import type { GeneratedPlaylist } from "@/features/playlists";
import type { PlaylistRequest } from "@/types/playlist";
jest.mock("@/features/library/summarization", () => ({
  __esModule: true,
  getCurrentLibrarySummary: jest.fn(),
}));

jest.mock("@/features/playlists/strategy", () => ({
  __esModule: true,
  getStrategy: jest.fn(),
}));

jest.mock("@/features/playlists/generation", () => ({
  __esModule: true,
  generatePlaylistFromStrategy: jest.fn(),
}));

const { getCurrentLibrarySummary: mockedGetCurrentLibrarySummary } =
  jest.requireMock("@/features/library/summarization") as {
    getCurrentLibrarySummary: jest.Mock;
  };
const { getStrategy: mockedGetStrategy } = jest.requireMock("@/features/playlists/strategy") as {
  getStrategy: jest.Mock;
};
const {
  generatePlaylistFromStrategy: mockedGeneratePlaylistFromStrategy,
} = jest.requireMock("@/features/playlists/generation") as {
  generatePlaylistFromStrategy: jest.Mock;
};

const { buildRemixRequest, remixSavedPlaylist } = require("@/features/playlists/remix");

const basePlaylist: GeneratedPlaylist = {
  id: "playlist-1",
  title: "Morning Vibes",
  description: "Upbeat start",
  trackFileIds: ["track-1", "track-2"],
  trackSelections: [],
  totalDuration: 600,
  summary: {
    genreMix: new Map([
      ["Rock", 4],
      ["Pop", 2],
    ]),
    tempoMix: new Map([
      ["medium", 6],
      ["fast", 2],
    ]),
    artistMix: new Map([["Artist", 3]]),
    totalDuration: 1200,
    trackCount: 8,
    avgDuration: 150,
    minDuration: 120,
    maxDuration: 240,
  },
  strategy: {
    genreMixGuidance: {
      primaryGenres: ["Indie"],
      secondaryGenres: ["Rock"],
    },
    tempoGuidance: {
      targetBucket: "fast",
      allowVariation: true,
    },
    vibeTags: ["Energetic", "Bright"],
    scoringWeights: {
      diversity: 0.55,
    },
  } as any,
  createdAt: 123,
};

describe("buildRemixRequest", () => {
  it("uses stored request and normalizes missing fields", () => {
    const storedRequest: PlaylistRequest = {
      genres: undefined as any,
      length: { type: "tracks", value: 12 },
      mood: undefined as any,
      activity: undefined as any,
      tempo: undefined as any,
      surprise: 0.2,
      agentType: "built-in",
    };

    const result = buildRemixRequest(basePlaylist, storedRequest);
    expect(result.genres).toEqual([]);
    expect(result.mood).toEqual([]);
    expect(result.activity).toEqual([]);
    expect(result.tempo).toEqual({});
    expect(result.length).toEqual({ type: "tracks", value: 12 });
    expect(result.surprise).toBe(0.2);
  });

  it("infers request from strategy and summary when missing", () => {
    const inferred = buildRemixRequest({
      ...basePlaylist,
      discoveryTracks: [
        {
          position: 1,
          discoveryTrack: {
            mbid: "mbid",
            title: "Discovery",
            artist: "Artist",
            album: "Album",
            genres: ["Indie"],
            duration: 200,
            score: 0.8,
            inspiringTrackId: "track-1",
            explanation: "Because",
          },
          inspiringTrackId: "track-1",
        },
      ],
    } as GeneratedPlaylist);

    expect(inferred.genres).toEqual(
      expect.arrayContaining(["Indie", "Rock", "Pop"])
    );
    expect(inferred.tempo).toEqual({ bucket: "fast" });
    expect(inferred.length.type).toBe("minutes");
    expect(inferred.length.value).toBe(20);
    expect(inferred.mood).toEqual(["energetic", "bright"]);
    expect(inferred.surprise).toBe(0.55);
    expect(inferred.enableDiscovery).toBe(true);
    expect(inferred.discoveryFrequency).toBe("every");
  });
});

describe("remixSavedPlaylist", () => {
  beforeEach(() => {
    mockedGetCurrentLibrarySummary.mockResolvedValue({} as any);
    mockedGetStrategy.mockResolvedValue({ title: "Strategy", description: "desc" } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("regenerates with exclusions and retries without them on empty results", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1234);
    jest.spyOn(Math, "random").mockReturnValue(0.123456);

    mockedGeneratePlaylistFromStrategy
      .mockRejectedValueOnce(new Error("No tracks available after filtering"))
      .mockResolvedValueOnce({
        ...basePlaylist,
        id: "playlist-remix",
        title: "Generated",
        description: "Generated",
      });

    const result = await remixSavedPlaylist({
      playlist: basePlaylist,
      libraryRootId: "root-1",
      title: "My Remix",
      description: "New desc",
    });

    expect(mockedGeneratePlaylistFromStrategy).toHaveBeenCalledTimes(2);
    const firstCallArgs = mockedGeneratePlaylistFromStrategy.mock.calls[0];
    expect(firstCallArgs[3]).toEqual(expect.stringMatching(/^remix-1234-/));
    expect(firstCallArgs[4]).toEqual(["track-1", "track-2"]);

    const secondCallArgs = mockedGeneratePlaylistFromStrategy.mock.calls[1];
    expect(secondCallArgs[4]).toBeUndefined();

    expect(result.playlist.title).toBe("My Remix");
    expect(result.playlist.description).toBe("New desc");
    expect(result.request.collectionId).toBe("root-1");

    jest.restoreAllMocks();
  });
});
