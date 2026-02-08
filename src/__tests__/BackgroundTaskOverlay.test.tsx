import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BackgroundTaskOverlay } from "@/components/BackgroundTaskOverlay";
import { useBackgroundLibraryTasks } from "@/components/BackgroundLibraryTasksProvider";
import { usePathname } from "next/navigation";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

jest.mock("@/components/BackgroundLibraryTasksProvider", () => ({
  useBackgroundLibraryTasks: jest.fn(),
}));

const mockUsePathname = usePathname as jest.Mock;
const mockUseBackgroundLibraryTasks = useBackgroundLibraryTasks as jest.Mock;

const baseTasks = {
  scanning: {
    isScanning: false,
    scanProgress: null,
  },
  metadataParsing: {
    isParsingMetadata: false,
    metadataProgress: null,
    isDetectingTempo: false,
    tempoProgress: null,
  },
  metadataEnhancement: {
    isEnhancing: false,
    progress: null,
  },
  trackIdentityBackfill: {
    isBackfilling: false,
    progress: null,
  },
};

describe("BackgroundTaskOverlay", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/playlists/new");
    mockUseBackgroundLibraryTasks.mockReturnValue(baseTasks);
  });

  it("does not render on the library page", () => {
    mockUsePathname.mockReturnValue("/library");
    mockUseBackgroundLibraryTasks.mockReturnValue({
      ...baseTasks,
      scanning: { isScanning: true, scanProgress: { scanned: 1, found: 2 } },
    });

    render(<BackgroundTaskOverlay />);

    expect(screen.queryByText(/background tasks/i)).toBeNull();
  });

  it("shows active task statuses with counts", () => {
    mockUseBackgroundLibraryTasks.mockReturnValue({
      scanning: {
        isScanning: true,
        scanProgress: { scanned: 2, found: 5, currentFile: "track1.mp3" },
      },
      metadataParsing: {
        isParsingMetadata: true,
        metadataProgress: { parsed: 3, total: 10, errors: 0, currentFile: "track2.mp3" },
        isDetectingTempo: true,
        tempoProgress: { processed: 4, total: 10, detected: 2, currentTrack: "track3.mp3" },
      },
      metadataEnhancement: {
        isEnhancing: true,
        progress: {
          processed: 1,
          total: 8,
          enhanced: 1,
          matched: 1,
          tempoDetected: 0,
          currentTrack: {
            trackFileId: "track-1",
            libraryRootId: "root-1",
            tags: { title: "Track 1", artist: "Artist 1", genres: [] },
            updatedAt: Date.now(),
          },
        },
      },
      trackIdentityBackfill: {
        isBackfilling: false,
        progress: null,
      },
    });

    render(<BackgroundTaskOverlay />);

    expect(screen.getByText(/background tasks/i)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText(/scanning library/i)).toBeInTheDocument();
    expect(screen.getByText(/processing metadata/i)).toBeInTheDocument();
    expect(screen.getByText(/detecting tempo/i)).toBeInTheDocument();
    expect(screen.getByText(/enhancing metadata/i)).toBeInTheDocument();
    expect(screen.getByText("2/5 files")).toBeInTheDocument();
    expect(screen.getByText("3/10 files")).toBeInTheDocument();
    expect(screen.getByText("2/4 detected")).toBeInTheDocument();
    expect(screen.getByText("1/8 tracks")).toBeInTheDocument();
  });

  it("collapses and expands the task list", () => {
    mockUseBackgroundLibraryTasks.mockReturnValue({
      ...baseTasks,
      scanning: {
        isScanning: true,
        scanProgress: { scanned: 1, found: 2 },
      },
    });

    render(<BackgroundTaskOverlay />);

    expect(screen.getByText(/scanning library/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /background tasks/i }));
    expect(screen.queryByText(/scanning library/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /background tasks/i }));
    expect(screen.getByText(/scanning library/i)).toBeInTheDocument();
  });
});
