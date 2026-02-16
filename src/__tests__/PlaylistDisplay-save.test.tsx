/**
 * Unit tests for PlaylistDisplay save behavior (in and out of edit mode)
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PlaylistDisplay } from "@/components/PlaylistDisplay";
import type { GeneratedPlaylist } from "@/features/playlists";
import type { TrackRecord } from "@/db/schema";
import { getCompositeId } from "@/db/schema";

function mockPlaylist(overrides: Partial<GeneratedPlaylist> = {}): GeneratedPlaylist {
  return {
    id: "playlist-1",
    title: "Test Playlist",
    description: "A test playlist",
    trackFileIds: ["track-1", "track-2"],
    trackSelections: [
      {
        trackFileId: "track-1",
        track: {} as TrackRecord,
        score: 0.8,
        reasons: [],
        genreMatch: 0.8,
        tempoMatch: 0.8,
        moodMatch: 0.5,
        activityMatch: 0.5,
        durationFit: 0.8,
        diversity: 0.7,
        surprise: 0.3,
      },
      {
        trackFileId: "track-2",
        track: {} as TrackRecord,
        score: 0.7,
        reasons: [],
        genreMatch: 0.7,
        tempoMatch: 0.7,
        moodMatch: 0.5,
        activityMatch: 0.5,
        durationFit: 0.8,
        diversity: 0.6,
        surprise: 0.4,
      },
    ],
    orderedTracks: [
      { trackFileId: "track-1", position: 0, section: "warmup", reasons: [], transitionScore: 1 },
      { trackFileId: "track-2", position: 1, section: "peak", reasons: [], transitionScore: 0.9 },
    ],
    totalDuration: 360,
    summary: {
      genreMix: new Map([["Rock", 2]]),
      tempoMix: new Map([["medium", 2]]),
      artistMix: new Map([["Artist", 2]]),
      totalDuration: 360,
      trackCount: 2,
      avgDuration: 180,
      minDuration: 120,
      maxDuration: 240,
    },
    strategy: {
      title: "Test",
      description: "Test",
      constraints: {},
      scoringWeights: {},
      diversityRules: {},
      orderingPlan: { sections: [{ name: "peak", startPosition: 0, endPosition: 1 }] },
      vibeTags: [],
      tempoGuidance: {},
      genreMixGuidance: {},
    } as GeneratedPlaylist["strategy"],
    createdAt: Date.now(),
    ...overrides,
  };
}

const mockTrackRecord = (id: string): TrackRecord =>
  ({
    id: getCompositeId(id, "root-1"),
    trackFileId: id,
    libraryRootId: "root-1",
    tags: { title: `Track ${id}`, artist: "Artist", album: "Album", genres: ["Rock"], year: 2020 },
    tech: { durationSeconds: 180 },
    updatedAt: Date.now(),
  }) as TrackRecord;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/db/storage", () => ({
  getCurrentLibraryRoot: jest.fn(async () => ({
    id: "root-1",
    mode: "handle" as const,
    name: "Test",
    handleRef: "handle-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
  getAllGenres: jest.fn(async () => []),
  getAllArtists: jest.fn(async () => []),
  getAllAlbums: jest.fn(async () => []),
  getAllTrackTitles: jest.fn(async () => []),
}));

jest.mock("@/db/playlist-storage", () => ({
  savePlaylist: jest.fn(async () => {}),
  updatePlaylist: jest.fn(async () => {}),
  updatePlaylistMetadata: jest.fn(async () => {}),
  isPlaylistSaved: jest.fn(async () => false),
  getSavedPlaylistRequest: jest.fn(async () => undefined),
}));

jest.mock("@/db/schema", () => {
  const actual = jest.requireActual("@/db/schema");
  return {
    ...actual,
    db: {
      tracks: {
        bulkGet: jest.fn(async (ids: string[]) =>
          ids.map(() => ({
            id: "track-1-root-1",
            trackFileId: "track-1",
            libraryRootId: "root-1",
            tags: { title: "Track 1", artist: "Artist", album: "Album", genres: ["Rock"], year: 2020 },
            tech: { durationSeconds: 180 },
            updatedAt: Date.now(),
          }))
        ),
        where: () => ({
          anyOf: () => ({
            toArray: async () => [
              { trackFileId: "track-1", libraryRootId: "root-1", tags: {}, tech: {} },
              { trackFileId: "track-2", libraryRootId: "root-1", tags: {}, tech: {} },
            ],
          }),
        }),
      },
    },
  };
});

jest.mock("@/features/playlists", () => ({
  getStrategy: jest.fn(async () => ({})),
  generatePlaylistFromStrategy: jest.fn(),
  generateReplacementTracksFromStrategy: jest.fn(async () => []),
  remixSavedPlaylist: jest.fn(),
}));

jest.mock("@/features/library/summarization", () => ({
  getCurrentLibrarySummary: jest.fn(async () => ({})),
  buildMatchingIndex: jest.fn(async () => ({
    byGenre: new Map(),
    byArtist: new Map(),
    byTempoBucket: new Map(),
    byDurationBucket: new Map(),
    allTrackIds: new Set(),
    trackMetadata: new Map(),
    genreMappings: { originalToNormalized: new Map(), normalizedToOriginals: new Map() },
  })),
}));

jest.mock("@/hooks/useAudioPreviewState", () => ({
  useAudioPreviewState: () => ({
    playingTrackId: null,
    searchingTrackId: null,
    hasSampleResult: () => false,
    getSampleResult: () => null,
    getError: () => undefined,
    setSampleResult: jest.fn(),
    setError: jest.fn(),
    setPlayingTrack: jest.fn(),
    clearPlayingTrack: jest.fn(),
    setSearchingTrack: jest.fn(),
    clearAll: jest.fn(),
  }),
}));

jest.mock("@/features/playlists/ordering", () => ({
  orderTracks: jest.fn(() => ({
    tracks: [
      { trackFileId: "track-1", position: 0, section: "warmup", reasons: [], transitionScore: 1 },
      { trackFileId: "track-2", position: 1, section: "peak", reasons: [], transitionScore: 0.9 },
    ],
    arc: { warmup: 1, build: 0, peak: 1, cooldown: 0 },
  })),
}));

jest.mock("@/features/playlists/naming", () => ({
  generatePlaylistTitle: jest.fn(() => ({ title: "Test", subtitle: "Test", emoji: "🎵" })),
}));

jest.mock("@/features/playlists/variants", () => ({
  generateVariant: jest.fn(),
  getVariantDescription: jest.fn(),
}));

jest.mock("@/components/PlaylistWhySummary", () => ({
  PlaylistWhySummary: () => null,
}));
jest.mock("@/components/TrackReasonChips", () => ({
  TrackReasonChips: () => null,
}));
jest.mock("@/components/PlaylistExport", () => ({
  PlaylistExport: () => null,
}));
jest.mock("@/components/DiscoveryTrackBadge", () => ({
  DiscoveryTrackBadge: () => null,
}));
jest.mock("@/components/InlineAudioPlayer", () => ({
  InlineAudioPlayer: () => null,
}));
jest.mock("@/components/FlowArcEditor", () => ({
  FlowArcEditor: () => null,
}));
jest.mock("@/components/EmojiPicker", () => ({
  EmojiPicker: () => null,
}));
jest.mock("@/components/DraggableTrackList", () => ({
  DraggableTrackList: () => null,
}));
jest.mock("@/components/TrackAddDialog", () => ({
  TrackAddDialog: () => null,
}));
jest.mock("@/components/TrackExpansionPanel", () => ({
  TrackExpansionPanel: () => null,
}));
jest.mock("@/components/SavePlaylistDialog", () => ({
  SavePlaylistDialog: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: (opts: { mode: string }) => void }) =>
    isOpen ? (
      <div data-testid="save-dialog">
        <button onClick={() => onConfirm({ mode: "override", title: "Test", description: "" })}>
          Confirm Save
        </button>
      </div>
    ) : null,
}));

describe("PlaylistDisplay save behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem("playlist-request", JSON.stringify({ genres: [], length: { type: "tracks" as const, value: 10 },
      mood: [], activity: [], tempo: {}, surprise: 0 }));
    const { isPlaylistSaved } = jest.requireMock("@/db/playlist-storage");
    isPlaylistSaved.mockResolvedValue(false);
  });

  it("renders and shows Save Playlist when not saved", async () => {
    const playlist = mockPlaylist();
    sessionStorage.setItem(
      "generated-playlist",
      JSON.stringify({
        ...playlist,
        summary: {
          genreMix: Object.fromEntries(playlist.summary.genreMix),
          tempoMix: Object.fromEntries(playlist.summary.tempoMix),
          artistMix: Object.fromEntries(playlist.summary.artistMix),
          totalDuration: playlist.summary.totalDuration,
          trackCount: playlist.summary.trackCount,
          avgDuration: playlist.summary.avgDuration,
          minDuration: playlist.summary.minDuration,
          maxDuration: playlist.summary.maxDuration,
        },
      })
    );

    render(<PlaylistDisplay playlist={playlist} playlistCollectionId="root-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save playlist/i })).toBeInTheDocument();
    });
  });

  it("shows Edit Mode and Save Playlist when playlist has tracks", async () => {
    const playlist = mockPlaylist();
    sessionStorage.setItem(
      "generated-playlist",
      JSON.stringify({
        ...playlist,
        summary: {
          genreMix: Object.fromEntries(playlist.summary.genreMix),
          tempoMix: Object.fromEntries(playlist.summary.tempoMix),
          artistMix: Object.fromEntries(playlist.summary.artistMix),
          totalDuration: playlist.summary.totalDuration,
          trackCount: playlist.summary.trackCount,
          avgDuration: playlist.summary.avgDuration,
          minDuration: playlist.summary.minDuration,
          maxDuration: playlist.summary.maxDuration,
        },
      })
    );

    render(<PlaylistDisplay playlist={playlist} playlistCollectionId="root-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /edit mode/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /edit mode/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /exit edit/i })).toBeInTheDocument();
    });
  });
});
