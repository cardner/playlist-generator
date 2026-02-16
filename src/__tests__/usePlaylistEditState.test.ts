/**
 * Unit tests for usePlaylistEditState hook
 */

import { renderHook, act } from "@testing-library/react";
import { usePlaylistEditState } from "@/hooks/usePlaylistEditState";
import type { GeneratedPlaylist } from "@/features/playlists";

function mockPlaylist(overrides: Partial<GeneratedPlaylist> = {}): GeneratedPlaylist {
  return {
    id: "playlist-1",
    title: "Test Playlist",
    description: "Test",
    trackFileIds: ["t1", "t2", "t3"],
    trackSelections: [],
    totalDuration: 540,
    summary: {
      genreMix: new Map([["Rock", 3]]),
      tempoMix: new Map([["medium", 3]]),
      artistMix: new Map([["Artist", 3]]),
      totalDuration: 540,
      trackCount: 3,
      avgDuration: 180,
      minDuration: 120,
      maxDuration: 240,
    },
    strategy: {} as GeneratedPlaylist["strategy"],
    createdAt: Date.now(),
    ...overrides,
  };
}

function mockBuildSummary(trackFileIds: string[]) {
  const totalDuration = trackFileIds.length * 180;
  return {
    genreMix: new Map([["Rock", trackFileIds.length]]),
    tempoMix: new Map([["medium", trackFileIds.length]]),
    artistMix: new Map([["Artist", trackFileIds.length]]),
    totalDuration,
    trackCount: trackFileIds.length,
    avgDuration: 180,
    minDuration: 120,
    maxDuration: 240,
  };
}

describe("usePlaylistEditState", () => {
  it("initializes with playlist and isDirty false", () => {
    const playlist = mockPlaylist();
    const { result } = renderHook(() =>
      usePlaylistEditState(playlist, { buildSummary: mockBuildSummary })
    );

    expect(result.current.isDirty).toBe(false);
    expect(result.current.editedPlaylist.trackFileIds).toEqual(["t1", "t2", "t3"]);
  });

  it("sets isDirty when updateTrackFileIds is called", () => {
    const playlist = mockPlaylist();
    const { result } = renderHook(() =>
      usePlaylistEditState(playlist, { buildSummary: mockBuildSummary })
    );

    act(() => {
      result.current.updateTrackFileIds(["t1", "t3"]);
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.editedPlaylist.trackFileIds).toEqual(["t1", "t3"]);
  });

  it("sets isDirty when updatePlaylist is called", () => {
    const playlist = mockPlaylist();
    const { result } = renderHook(() =>
      usePlaylistEditState(playlist, { buildSummary: mockBuildSummary })
    );

    act(() => {
      result.current.updatePlaylist((prev) => ({
        ...prev,
        trackFileIds: ["t1"],
      }));
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.editedPlaylist.trackFileIds).toEqual(["t1"]);
  });

  it("resets edits when resetEdits is called", () => {
    const playlist = mockPlaylist();
    const { result } = renderHook(() =>
      usePlaylistEditState(playlist, { buildSummary: mockBuildSummary })
    );

    act(() => {
      result.current.updateTrackFileIds(["t1"]);
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.resetEdits();
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.editedPlaylist.trackFileIds).toEqual(["t1", "t2", "t3"]);
  });

  it("clears dirty when markClean is called", () => {
    const playlist = mockPlaylist();
    const { result } = renderHook(() =>
      usePlaylistEditState(playlist, { buildSummary: mockBuildSummary })
    );

    act(() => {
      result.current.updateTrackFileIds(["t1", "t2"]);
    });
    expect(result.current.isDirty).toBe(true);

    const savedPlaylist = mockPlaylist({ trackFileIds: ["t1", "t2"] });
    act(() => {
      result.current.markClean(savedPlaylist);
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.editedPlaylist.trackFileIds).toEqual(["t1", "t2"]);
  });

  it("syncs to new playlist when playlist prop changes", () => {
    const playlist1 = mockPlaylist({ id: "p1", trackFileIds: ["t1", "t2"] });
    const { result, rerender } = renderHook(
      ({ playlist }) =>
        usePlaylistEditState(playlist, { buildSummary: mockBuildSummary }),
      { initialProps: { playlist: playlist1 } }
    );

    act(() => {
      result.current.updateTrackFileIds(["t1"]);
    });
    expect(result.current.isDirty).toBe(true);

    const playlist2 = mockPlaylist({ id: "p2", trackFileIds: ["t4", "t5"] });
    rerender({ playlist: playlist2 });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.editedPlaylist.trackFileIds).toEqual(["t4", "t5"]);
  });
});
