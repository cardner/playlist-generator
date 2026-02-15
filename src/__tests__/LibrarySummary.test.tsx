/**
 * Unit tests for LibrarySummary component
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LibrarySummary } from "@/components/LibrarySummary";
import type { LibrarySummary as LibrarySummaryType } from "@/features/library/summarization";

const mockSummary: LibrarySummaryType = {
  totalTracks: 100,
  genreCounts: [
    { genre: "Rock", count: 40 },
    { genre: "Pop", count: 30 },
    { genre: "Jazz", count: 20 },
  ],
  artistCounts: [
    { artist: "Wilco", count: 15 },
    { artist: "Bob Dylan", count: 12 },
  ],
  tempoDistribution: { slow: 20, medium: 50, fast: 30, unknown: 0 },
  durationStats: { min: 120, max: 360, avg: 240, total: 24000 },
  recentlyAdded: { last24Hours: 0, last7Days: 5, last30Days: 20 },
};

jest.mock("@/db/storage", () => ({
  getCurrentLibraryRoot: jest.fn(async () => ({
    id: "root-1",
    mode: "handle" as const,
    name: "Test Library",
  })),
}));

jest.mock("@/features/library/summarization", () => ({
  getCurrentLibrarySummary: jest.fn(async () => mockSummary),
  summarizeLibrary: jest.fn(async () => mockSummary),
}));

describe("LibrarySummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getCurrentLibraryRoot } = jest.requireMock("@/db/storage");
    const { getCurrentLibrarySummary } =
      jest.requireMock("@/features/library/summarization");
    getCurrentLibraryRoot.mockResolvedValue({
      id: "root-1",
      mode: "handle",
      name: "Test Library",
    });
    getCurrentLibrarySummary.mockResolvedValue(mockSummary);
  });

  it("renders summary with genres and artists when loaded", async () => {
    render(<LibrarySummary />);

    await waitFor(() => {
      expect(screen.getByText("Rock")).toBeInTheDocument();
      expect(screen.getByText("Pop")).toBeInTheDocument();
      expect(screen.getByText("Wilco")).toBeInTheDocument();
      expect(screen.getByText("Bob Dylan")).toBeInTheDocument();
    });

    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Added in Last 7 Days")).toBeInTheDocument();
  });

  it("calls onGenreClick when genre chip is clicked", async () => {
    const onGenreClick = jest.fn();

    render(<LibrarySummary onGenreClick={onGenreClick} />);

    await waitFor(() => {
      expect(screen.getByText("Rock")).toBeInTheDocument();
    });

    const rockChip = screen.getByRole("button", { name: /Rock \(40\)/ });
    fireEvent.click(rockChip);

    expect(onGenreClick).toHaveBeenCalledWith("Rock");
  });

  it("calls onArtistClick when artist chip is clicked", async () => {
    const onArtistClick = jest.fn();

    render(<LibrarySummary onArtistClick={onArtistClick} />);

    await waitFor(() => {
      expect(screen.getByText("Wilco")).toBeInTheDocument();
    });

    const wilcoChip = screen.getByRole("button", { name: /Wilco \(15\)/ });
    fireEvent.click(wilcoChip);

    expect(onArtistClick).toHaveBeenCalledWith("Wilco");
  });

  it("renders genre chips as buttons when onGenreClick provided", async () => {
    render(<LibrarySummary onGenreClick={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Rock")).toBeInTheDocument();
    });

    const genreChips = screen.getAllByRole("button", { name: /Rock|Pop|Jazz/ });
    expect(genreChips.length).toBeGreaterThanOrEqual(1);
  });

  it("renders artist chips as buttons when onArtistClick provided", async () => {
    render(<LibrarySummary onArtistClick={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Wilco")).toBeInTheDocument();
    });

    const artistChips = screen.getAllByRole("button", { name: /Wilco|Bob Dylan/ });
    expect(artistChips.length).toBeGreaterThanOrEqual(1);
  });
});
