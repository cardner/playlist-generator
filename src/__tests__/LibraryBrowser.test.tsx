/**
 * Unit tests for LibraryBrowser component (pagination and track display)
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LibraryBrowser } from "@/components/LibraryBrowser";
import { getCompositeId } from "@/db/schema";
import type { TrackRecord } from "@/db/schema";
import type { GenreWithStats } from "@/features/library/genre-normalization";

function createTrack(
  i: number,
  overrides: Partial<TrackRecord> = {}
): TrackRecord {
  const trackFileId = `track-${i}`;
  const libraryRootId = "root-1";
  return {
    id: getCompositeId(trackFileId, libraryRootId),
    trackFileId,
    libraryRootId,
    tags: {
      title: `Track ${i}`,
      artist: `Artist ${i}`,
      album: `Album ${i}`,
      genres: ["Rock"],
      year: 2020,
      trackNo: i,
      discNo: 1,
    },
    tech: { durationSeconds: 180 },
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createTracks(count: number): TrackRecord[] {
  return Array.from({ length: count }, (_, i) => createTrack(i + 1));
}

const mockTracks = createTracks(150);
const mockGenresWithStats: GenreWithStats[] = [
  { normalized: "Rock", trackCount: 150, originalVariants: ["Rock"] },
];

jest.mock("@/db/storage", () => ({
  getCurrentLibraryRoot: jest.fn(async () => ({
    id: "root-1",
    mode: "handle" as const,
    name: "Test Library",
    handleRef: "handle-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })),
  getTracks: jest.fn(async () => mockTracks),
  getWritebackStatuses: jest.fn(async () => []),
  getAllGenresWithStats: jest.fn(async () => mockGenresWithStats),
  clearLibraryData: jest.fn(async () => {}),
  searchTracks: jest.fn(),
  filterTracksByGenre: jest.fn(),
  getAllGenres: jest.fn(async () => ["Rock"]),
  getAllTracks: jest.fn(async () => mockTracks),
}));

jest.mock("@/features/library/genre-normalization", () => ({
  normalizeGenre: jest.fn((g: string) => g.toLowerCase()),
  buildGenreMappings: jest.fn(() => ({
    originalToNormalized: new Map([["Rock", "rock"]]),
  })),
}));

jest.mock("@/hooks/useAudioPreviewState", () => ({
  useAudioPreviewState: () => ({
    playingTrackId: null,
    searchingTrackId: null,
    hasSampleResult: () => false,
    getSampleResult: () => null,
    setSampleResult: jest.fn(),
    setError: jest.fn(),
    setPlayingTrack: jest.fn(),
    clearPlayingTrack: jest.fn(),
    setSearchingTrack: jest.fn(),
    clearAll: jest.fn(),
  }),
}));

jest.mock("@/hooks/useMetadataWriteback", () => ({
  useMetadataWriteback: () => ({
    isWriting: false,
    writebackProgress: null,
    error: null,
    handleWriteback: jest.fn(),
    isValidating: false,
    validationResults: null,
    validationError: null,
    handleValidateWriteback: jest.fn(),
    clearError: jest.fn(),
    clearValidation: jest.fn(),
  }),
}));

jest.mock("@/components/LibraryBrowserTrackRow", () => ({
  LibraryBrowserTrackRow: ({
    track,
  }: {
    track: TrackRecord;
  }) => (
    <tr data-testid="track-row" data-artist={track.tags.artist}>
      <td>{track.tags.title}</td>
    </tr>
  ),
}));

describe("LibraryBrowser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getTracks, getCurrentLibraryRoot, getAllGenresWithStats } =
      jest.requireMock("@/db/storage");
    getTracks.mockResolvedValue(mockTracks);
    getCurrentLibraryRoot.mockResolvedValue({
      id: "root-1",
      mode: "handle",
      name: "Test Library",
      handleRef: "handle-1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    getAllGenresWithStats.mockResolvedValue(mockGenresWithStats);
  });

  it("renders loading state initially then shows tracks", async () => {
    render(<LibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Tracks")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Track 1")).toBeInTheDocument();
    });
  });

  it("shows pagination when more tracks than default page size", async () => {
    render(<LibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Track 1")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /prev/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    });
  });

  it("shows correct pagination range", async () => {
    render(<LibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText(/1–100 of 150/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/1\/2/)).toBeInTheDocument();
  });

  it("navigates to next page when Next clicked", async () => {
    render(<LibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Track 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText(/101–150 of 150/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/2\/2/)).toBeInTheDocument();
    const rows = screen.getAllByTestId("track-row");
    expect(rows).toHaveLength(50);
  });

  it("navigates to previous page when Previous clicked", async () => {
    render(<LibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Track 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => {
      expect(screen.getByText(/101–150 of 150/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /prev/i }));
    await waitFor(() => {
      expect(screen.getByText(/1–100 of 150/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Track 1")).toBeInTheDocument();
  });

  it("shows page size selector with options", async () => {
    render(<LibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText(/per page/i)).toBeInTheDocument();
    });

    const perPageSelect = screen.getByLabelText(/per page/i);
    expect(perPageSelect).toHaveValue("100");
    fireEvent.change(perPageSelect, { target: { value: "50" } });

    await waitFor(() => {
      expect(perPageSelect).toHaveValue("50");
    });
  });

  it("renders 100 tracks on first page by default", async () => {
    render(<LibraryBrowser />);

    await waitFor(() => {
      const rows = screen.getAllByTestId("track-row");
      expect(rows).toHaveLength(100);
    });
  });

  it("does not show pagination when fewer tracks than page size", async () => {
    const { getTracks } = jest.requireMock("@/db/storage");
    getTracks.mockResolvedValue(createTracks(10));

    render(<LibraryBrowser />);

    await waitFor(() => {
      expect(screen.getByText("Track 1")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /prev/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
  });

  describe("genre and artist filters (additive OR logic)", () => {
    it("narrows to matching artist when single artist filter applied", async () => {
      const base1 = createTrack(1);
      const base2 = createTrack(2);
      const base3 = createTrack(3);
      const filterTracks = [
        { ...base1, tags: { ...base1.tags, artist: "Wilco" } },
        { ...base2, tags: { ...base2.tags, artist: "Bob Dylan" } },
        { ...base3, tags: { ...base3.tags, artist: "Jets to Brazil" } },
      ];
      const { getTracks } = jest.requireMock("@/db/storage");
      getTracks.mockResolvedValue(filterTracks);

      render(
        <LibraryBrowser
          filters={[{ type: "artist", value: "Wilco" }]}
          onFiltersChange={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Track 1")).toBeInTheDocument();
      });

      const rows = screen.getAllByTestId("track-row");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveAttribute("data-artist", "Wilco");
    });

    it("adds results from second artist when multiple artist filters (OR)", async () => {
      const base1 = createTrack(1);
      const base2 = createTrack(2);
      const base3 = createTrack(3);
      const filterTracks = [
        { ...base1, tags: { ...base1.tags, artist: "Wilco" } },
        { ...base2, tags: { ...base2.tags, artist: "Bob Dylan" } },
        { ...base3, tags: { ...base3.tags, artist: "Jets to Brazil" } },
      ];
      const { getTracks } = jest.requireMock("@/db/storage");
      getTracks.mockResolvedValue(filterTracks);

      render(
        <LibraryBrowser
          filters={[
            { type: "artist", value: "Wilco" },
            { type: "artist", value: "Bob Dylan" },
          ]}
          onFiltersChange={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Track 1")).toBeInTheDocument();
        expect(screen.getByText("Track 2")).toBeInTheDocument();
      });

      const rows = screen.getAllByTestId("track-row");
      expect(rows).toHaveLength(2);
      const artists = rows.map((r) => r.getAttribute("data-artist"));
      expect(artists).toContain("Wilco");
      expect(artists).toContain("Bob Dylan");
    });

    it("narrows to matching genre when single genre filter applied", async () => {
      render(
        <LibraryBrowser
          filters={[{ type: "genre", value: "Rock" }]}
          onFiltersChange={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Track 1")).toBeInTheDocument();
      });

      const rows = screen.getAllByTestId("track-row");
      expect(rows).toHaveLength(100);
    });

    it("shows no tracks when artist filter matches nothing", async () => {
      render(
        <LibraryBrowser
          filters={[{ type: "artist", value: "Nonexistent Artist" }]}
          onFiltersChange={jest.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("No tracks match your filters.")).toBeInTheDocument();
      });

      expect(screen.queryAllByTestId("track-row")).toHaveLength(0);
    });

    it("uses controlled filters when filters and onFiltersChange provided", async () => {
      const onFiltersChange = jest.fn();

      render(
        <LibraryBrowser
          filters={[{ type: "artist", value: "Artist 1" }]}
          onFiltersChange={onFiltersChange}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /remove artist filter artist 1/i })
        ).toBeInTheDocument();
      });

      const removeButton = screen.getByRole("button", {
        name: /remove artist filter artist 1/i,
      });
      fireEvent.click(removeButton);

      expect(onFiltersChange).toHaveBeenCalledWith([]);
    });
  });
});
