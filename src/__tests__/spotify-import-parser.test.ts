import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "@jest/globals";
import { parseSpotifyExport, parseSpotifyFile } from "@/features/spotify-import/parser";

const fixturesDir = join(process.cwd(), "reference-files");

const readFixture = (fileName: string) =>
  readFileSync(join(fixturesDir, fileName), "utf8");

describe("Spotify import parser", () => {
  it("parses YourLibrary.json tracks array", () => {
    const content = readFixture("YourLibrary-sample.json");
    const result = parseSpotifyFile("YourLibrary.json", content);

    expect(result?.savedTracks).toHaveLength(1);
    expect(result?.savedTracks?.[0]).toMatchObject({
      artist: "Artist A",
      track: "Song A",
      album: "Album A",
      uri: "spotify:track:abc123",
    });
  });

  it("parses Playlist1.json with playlists array and nested tracks", () => {
    const content = readFixture("Playlist1-sample.json");
    const result = parseSpotifyFile("Playlist1.json", content);

    expect(result?.playlists).toHaveLength(1);
    const playlist = result?.playlists?.[0];
    expect(playlist?.name).toBe("Sample Playlist");
    expect(playlist?.tracks).toHaveLength(1);
    expect(playlist?.tracks?.[0]).toMatchObject({
      artist: "Artist A",
      track: "Song A",
      album: "Album A",
      uri: "spotify:track:abc123",
      addedAt: "2024-01-02",
    });
  });

  it("parses legacy single-playlist format", () => {
    const legacy = JSON.stringify({
      name: "Legacy Playlist",
      items: [
        {
          track: "Legacy Song",
          artist: "Legacy Artist",
          album: "Legacy Album",
          uri: "spotify:track:legacy123",
        },
      ],
    });

    const result = parseSpotifyFile("Playlist2.json", legacy);
    expect(result?.playlist?.name).toBe("Legacy Playlist");
    expect(result?.playlist?.tracks).toHaveLength(1);
    expect(result?.playlist?.tracks?.[0]).toMatchObject({
      artist: "Legacy Artist",
      track: "Legacy Song",
      album: "Legacy Album",
      uri: "spotify:track:legacy123",
    });
  });

  it("returns null for unknown file type", () => {
    const result = parseSpotifyFile("Other.json", "{}");
    expect(result).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const result = parseSpotifyFile("YourLibrary.json", "{invalid}");
    expect(result).toBeNull();
  });

  it("combines parsed files into a single export data structure", () => {
    const exportData = parseSpotifyExport([
      { fileName: "YourLibrary.json", content: readFixture("YourLibrary-sample.json") },
      { fileName: "Playlist1.json", content: readFixture("Playlist1-sample.json") },
    ]);

    expect(exportData.savedTracks).toHaveLength(1);
    expect(exportData.playlists).toHaveLength(1);
    expect(exportData.playlists[0]?.tracks).toHaveLength(1);
  });
});
