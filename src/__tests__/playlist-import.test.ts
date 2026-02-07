/**
 * Tests for playlist export/import functionality
 */

import { describe, it, expect } from "@jest/globals";
import {
  importPlaylists,
  validatePlaylistExportFormat,
  type PlaylistExport,
} from "@/db/storage-playlist-import";

const createMockPlaylistRecord = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "playlist-1",
  title: "Test Playlist",
  description: "A test playlist",
  trackFileIds: ["track-1", "track-2"],
  summary: {
    genreMix: { Rock: 2, Pop: 1 },
    tempoMix: { medium: 2, fast: 1 },
    artistMix: { "Artist A": 2, "Artist B": 1 },
    totalDuration: 360,
    trackCount: 3,
    avgDuration: 120,
    minDuration: 90,
    maxDuration: 150,
  },
  strategy: { title: "Test", description: "Test strategy" },
  libraryRootId: "root-1",
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
});

describe("validatePlaylistExportFormat", () => {
  it("returns true for valid export format", () => {
    const valid: PlaylistExport = {
      version: "1.0.0",
      exportedAt: Date.now(),
      playlists: [createMockPlaylistRecord() as never],
    };
    expect(validatePlaylistExportFormat(valid)).toBe(true);
  });

  it("returns false for null or undefined", () => {
    expect(validatePlaylistExportFormat(null)).toBe(false);
    expect(validatePlaylistExportFormat(undefined)).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(validatePlaylistExportFormat("string")).toBe(false);
    expect(validatePlaylistExportFormat(123)).toBe(false);
    expect(validatePlaylistExportFormat([])).toBe(false);
  });

  it("returns false when version is missing or wrong type", () => {
    const data = {
      exportedAt: 123,
      playlists: [createMockPlaylistRecord()],
    };
    expect(validatePlaylistExportFormat(data)).toBe(false);
    expect(validatePlaylistExportFormat({ ...data, version: 123 })).toBe(false);
  });

  it("returns false when exportedAt is missing or wrong type", () => {
    const data = {
      version: "1.0.0",
      playlists: [createMockPlaylistRecord()],
    };
    expect(validatePlaylistExportFormat(data)).toBe(false);
    expect(validatePlaylistExportFormat({ ...data, exportedAt: "123" })).toBe(false);
  });

  it("returns false when playlists is not an array", () => {
    const data = {
      version: "1.0.0",
      exportedAt: 123,
      playlists: {},
    };
    expect(validatePlaylistExportFormat(data)).toBe(false);
  });

  it("returns false when a playlist is missing required fields", () => {
    const data = {
      version: "1.0.0",
      exportedAt: 123,
      playlists: [
        createMockPlaylistRecord(),
        { id: "p2", title: "Missing description", trackFileIds: [] },
      ],
    };
    expect(validatePlaylistExportFormat(data)).toBe(false);
  });

  it("returns false when playlist has invalid id (non-string)", () => {
    const data = {
      version: "1.0.0",
      exportedAt: 123,
      playlists: [{ ...createMockPlaylistRecord(), id: 123 }],
    };
    expect(validatePlaylistExportFormat(data)).toBe(false);
  });

  it("returns false when playlist trackFileIds is not an array", () => {
    const data = {
      version: "1.0.0",
      exportedAt: 123,
      playlists: [{ ...createMockPlaylistRecord(), trackFileIds: "not-array" }],
    };
    expect(validatePlaylistExportFormat(data)).toBe(false);
  });

  it("returns true for empty playlists array", () => {
    const data = {
      version: "1.0.0",
      exportedAt: 123,
      playlists: [],
    };
    expect(validatePlaylistExportFormat(data)).toBe(true);
  });
});

describe("importPlaylists", () => {
  it("throws for invalid export format before touching database", async () => {
    await expect(importPlaylists({} as PlaylistExport, "root-1")).rejects.toThrow(
      "Invalid playlist export format"
    );
  });
});
