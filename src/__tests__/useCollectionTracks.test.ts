/**
 * Unit tests for useCollectionTracks hook.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { useCollectionTracks } from "@/hooks/useCollectionTracks";

const mockToArray = jest.fn();
jest.mock("@/db/schema", () => ({
  db: {
    tracks: {
      where: jest.fn(() => ({
        equals: jest.fn(() => ({
          toArray: mockToArray,
        })),
      })),
    },
  },
}));

jest.mock("@/db/storage", () => ({
  getFileIndexEntries: jest.fn(async () => []),
}));

describe("useCollectionTracks", () => {
  beforeEach(() => {
    mockToArray.mockResolvedValue([]);
  });

  it("returns idle status when enabled is false", async () => {
    mockToArray.mockResolvedValue([
      {
        trackFileId: "t1",
        tags: { title: "Track 1" },
        updatedAt: 1000,
      },
    ]);

    const { result } = renderHook(() =>
      useCollectionTracks("col-1", false)
    );

    expect(result.current.status).toBe("idle");
    expect(result.current.tracks).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("returns idle status when collectionId is empty", () => {
    const { result } = renderHook(() =>
      useCollectionTracks("", true)
    );

    expect(result.current.status).toBe("idle");
    expect(result.current.tracks).toEqual([]);
  });

  it("loads tracks when enabled and collectionId provided", async () => {
    mockToArray.mockResolvedValue([
      {
        trackFileId: "t1",
        tags: { title: "Track 1", artist: "Artist", album: "Album" },
        updatedAt: 1000,
      },
    ]);

    const { result } = renderHook(() =>
      useCollectionTracks("col-1", true)
    );

    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(result.current.tracks).toHaveLength(1);
    expect(result.current.tracks[0].trackFileId).toBe("t1");
    expect(result.current.tracks[0].title).toBe("Track 1");
    expect(result.current.tracks[0].artist).toBe("Artist");
    expect(result.current.tracks[0].album).toBe("Album");
    expect(result.current.error).toBeNull();
  });

  it("sets error status when load fails", async () => {
    mockToArray.mockRejectedValue(new Error("DB error"));

    const { result } = renderHook(() =>
      useCollectionTracks("col-1", true)
    );

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.error).toContain("DB error");
    expect(result.current.tracks).toEqual([]);
  });
});
