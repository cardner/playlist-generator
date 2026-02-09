import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { SpotifyExportData } from "@/features/spotify-import/types";

jest.mock("@/db/schema", () => ({
  db: {
    libraryRoots: {
      put: jest.fn(),
    },
  },
}));

const saveSpotifyTracksMock = jest.fn();
jest.mock("@/features/spotify-import/track-storage", () => ({
  saveSpotifyTracks: (...args: unknown[]) => saveSpotifyTracksMock(...args),
}));

describe("getAllUniqueTracksFromExport", () => {
  it("combines saved and playlist tracks with dedupe", async () => {
    const { getAllUniqueTracksFromExport } = await import(
      "@/features/spotify-import/collection-creator"
    );
    const exportData: SpotifyExportData = {
      savedTracks: [
        { artist: "Artist A", track: "Song A", uri: "spotify:track:abc" },
      ],
      followedArtists: [],
      playlists: [
        {
          name: "Playlist 1",
          tracks: [
            { artist: "Artist A", track: "Song A", uri: "spotify:track:abc" },
            { artist: "Artist B", track: "Song B", uri: "spotify:track:def" },
          ],
        },
      ],
      metadata: {
        exportDate: "2024-01-01",
        filePaths: [],
      },
    };

    const result = getAllUniqueTracksFromExport(exportData);
    expect(result).toHaveLength(2);
    expect(result.map((track) => track.uri)).toEqual([
      "spotify:track:abc",
      "spotify:track:def",
    ]);
  });
});

describe("createSpotifyCollection", () => {
  beforeEach(() => {
    saveSpotifyTracksMock.mockClear();
  });

  it("saves unique tracks from saved and playlist data", async () => {
    const { createSpotifyCollection } = await import(
      "@/features/spotify-import/collection-creator"
    );
    const exportData: SpotifyExportData = {
      savedTracks: [
        { artist: "Artist A", track: "Song A", uri: "spotify:track:abc" },
      ],
      followedArtists: [],
      playlists: [
        {
          name: "Playlist 1",
          tracks: [
            { artist: "Artist A", track: "Song A", uri: "spotify:track:abc" },
            { artist: "Artist B", track: "Song B", uri: "spotify:track:def" },
          ],
        },
      ],
      metadata: {
        exportDate: "2024-01-01",
        filePaths: [],
      },
    };

    await createSpotifyCollection(exportData, "Test Collection");
    expect(saveSpotifyTracksMock).toHaveBeenCalledTimes(1);
    const [tracksArg] = saveSpotifyTracksMock.mock.calls[0];
    expect(tracksArg).toHaveLength(2);
  });
});
