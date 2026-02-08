/**
 * Unit tests for LibraryBrowserTrackRow component
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { LibraryBrowserTrackRow } from "@/components/LibraryBrowserTrackRow";
import type { TrackRecord, TrackWritebackRecord } from "@/db/schema";
import { getCompositeId } from "@/db/schema";

jest.mock("@/components/TrackMetadataEditor", () => ({
  TrackMetadataEditor: ({
    track,
    onCancel,
    onSave,
  }: {
    track: TrackRecord;
    onCancel: () => void;
    onSave: () => void;
  }) => (
    <div data-testid="track-metadata-editor">
      <span>Editing: {track.tags.title}</span>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" onClick={() => onSave()}>
        Save
      </button>
    </div>
  ),
}));

jest.mock("@/components/InlineAudioPlayer", () => {
  const InlineAudioPlayer = React.forwardRef(
    (
      {
        trackFileId,
        onLoaded,
      }: {
        trackFileId: string;
        onLoaded?: () => void;
      },
      _ref: React.Ref<unknown>
    ) => (
      <div data-testid="inline-audio-player" data-track-id={trackFileId}>
        <button type="button" onClick={onLoaded}>
          Simulate loaded
        </button>
      </div>
    )
  );
  InlineAudioPlayer.displayName = "InlineAudioPlayer";
  return { InlineAudioPlayer };
});

function createTrack(overrides: Partial<TrackRecord> = {}): TrackRecord {
  const trackFileId = overrides.trackFileId ?? "track-1";
  const libraryRootId = overrides.libraryRootId ?? "root-1";
  return {
    id: getCompositeId(trackFileId, libraryRootId),
    trackFileId,
    libraryRootId,
    tags: {
      title: "Test Song",
      artist: "Test Artist",
      album: "Test Album",
      genres: ["Rock", "Pop"],
      year: 2020,
      trackNo: 1,
      discNo: 1,
    },
    tech: {
      durationSeconds: 245,
      bpm: 120,
      bpmConfidence: 0.9,
      bpmSource: "analysis",
      bpmMethod: "fft",
    },
    updatedAt: Date.now(),
    ...overrides,
  };
}

const defaultProps = {
  track: createTrack(),
  isEditing: false,
  genres: ["Rock", "Pop", "Jazz"],
  writebackStatus: undefined as TrackWritebackRecord | undefined,
  writebackState: null as "pending" | "error" | "synced" | null,
  playingTrackId: null as string | null,
  searchingTrackId: null as string | null,
  hasSampleResult: jest.fn(() => false),
  getSampleResult: jest.fn(() => null),
  onPlayClick: jest.fn(),
  onMouseEnter: jest.fn(),
  onMouseLeave: jest.fn(),
  onEditClick: jest.fn(),
  onEditCancel: jest.fn(),
  onSave: jest.fn(async () => {}),
  formatDuration: (seconds?: number) => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  },
  registerAudioRef: jest.fn(),
  onAudioLoaded: jest.fn(),
  setPlayingTrack: jest.fn(),
  setSearchingTrack: jest.fn(),
  setError: jest.fn(),
  clearPlayingTrack: jest.fn(),
};

function renderInTable(ui: React.ReactElement) {
  return render(
    <table>
      <tbody>{ui}</tbody>
    </table>
  );
}

describe("LibraryBrowserTrackRow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders track metadata", () => {
    const track = createTrack();
    renderInTable(<LibraryBrowserTrackRow {...defaultProps} track={track} />);

    expect(screen.getByText("Test Song")).toBeInTheDocument();
    expect(screen.getByText("Test Artist")).toBeInTheDocument();
    expect(screen.getByText("Test Album")).toBeInTheDocument();
    expect(screen.getByText("Rock, Pop")).toBeInTheDocument();
    expect(screen.getByText("4:05")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
  });

  it("renders play button with correct aria-label", () => {
    renderInTable(<LibraryBrowserTrackRow {...defaultProps} />);
    const playButton = screen.getByRole("button", { name: /play/i });
    expect(playButton).toBeInTheDocument();
  });

  it("calls onPlayClick when play button clicked", () => {
    const onPlayClick = jest.fn();
    renderInTable(
      <LibraryBrowserTrackRow
        {...defaultProps}
        onPlayClick={onPlayClick}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    expect(onPlayClick).toHaveBeenCalledWith(
      "track-1",
      expect.objectContaining({
        title: "Test Song",
        artist: "Test Artist",
        album: "Test Album",
      })
    );
  });

  it("calls onEditClick when edit button clicked", () => {
    const onEditClick = jest.fn();
    const track = createTrack({ trackFileId: "track-99" });
    renderInTable(
      <LibraryBrowserTrackRow
        {...defaultProps}
        track={track}
        onEditClick={onEditClick}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /edit metadata/i }));
    expect(onEditClick).toHaveBeenCalledWith("track-99-root-1");
  });

  it("shows TrackMetadataEditor when isEditing is true", () => {
    renderInTable(
      <LibraryBrowserTrackRow
        {...defaultProps}
        isEditing={true}
      />
    );
    expect(screen.getByTestId("track-metadata-editor")).toBeInTheDocument();
    expect(screen.getByText("Editing: Test Song")).toBeInTheDocument();
  });

  it("calls onEditCancel when cancel clicked in editor", () => {
    const onEditCancel = jest.fn();
    renderInTable(
      <LibraryBrowserTrackRow
        {...defaultProps}
        isEditing={true}
        onEditCancel={onEditCancel}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onEditCancel).toHaveBeenCalled();
  });

  it("calls onSave when save clicked in editor", async () => {
    const onSave = jest.fn(async () => {});
    renderInTable(
      <LibraryBrowserTrackRow
        {...defaultProps}
        isEditing={true}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it("shows InlineAudioPlayer when hasSampleResult returns true", () => {
    const hasSampleResult = jest.fn(() => true);
    const getSampleResult = jest.fn(() => ({
      url: "https://example.com/preview.mp3",
      platform: "itunes" as const,
      title: "Test Song",
      artist: "Test Artist",
    }));
    renderInTable(
      <LibraryBrowserTrackRow
        {...defaultProps}
        hasSampleResult={hasSampleResult}
        getSampleResult={getSampleResult}
      />
    );
    expect(screen.getByTestId("inline-audio-player")).toBeInTheDocument();
  });

  it("calls onAudioLoaded when audio player reports loaded", () => {
    const onAudioLoaded = jest.fn();
    const hasSampleResult = jest.fn(() => true);
    const getSampleResult = jest.fn(() => ({
      url: "https://example.com/preview.mp3",
      platform: "itunes" as const,
      title: "Test Song",
      artist: "Test Artist",
    }));
    renderInTable(
      <LibraryBrowserTrackRow
        {...defaultProps}
        hasSampleResult={hasSampleResult}
        getSampleResult={getSampleResult}
        onAudioLoaded={onAudioLoaded}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /simulate loaded/i }));
    expect(onAudioLoaded).toHaveBeenCalledWith("track-1");
  });

  it("displays writeback pending state", () => {
    renderInTable(
      <LibraryBrowserTrackRow
        {...defaultProps}
        writebackState="pending"
      />
    );
    expect(
      screen.getByLabelText(/metadata sync pending/i)
    ).toBeInTheDocument();
  });

  it("displays writeback error state", () => {
    renderInTable(
      <LibraryBrowserTrackRow
        {...defaultProps}
        writebackState="error"
        writebackStatus={{
          id: "track-1-root-1",
          trackFileId: "track-1",
          libraryRootId: "root-1",
          pending: true,
          pendingFields: [],
          lastWritebackError: "Failed to write",
          updatedAt: Date.now(),
        } as TrackWritebackRecord}
      />
    );
    expect(
      screen.getByLabelText(/metadata sync failed/i)
    ).toBeInTheDocument();
  });

  it("displays writeback synced state", () => {
    renderInTable(
      <LibraryBrowserTrackRow
        {...defaultProps}
        writebackState="synced"
      />
    );
    expect(
      screen.getByLabelText(/metadata synced/i)
    ).toBeInTheDocument();
  });

  it("disables play button when searchingTrackId matches", () => {
    renderInTable(
      <LibraryBrowserTrackRow
        {...defaultProps}
        searchingTrackId="track-1"
      />
    );
    const playButton = screen.getByRole("button", { name: /play/i });
    expect(playButton).toBeDisabled();
  });

  it("formatDuration handles missing duration", () => {
    const track = createTrack({ tech: undefined });
    renderInTable(<LibraryBrowserTrackRow {...defaultProps} track={track} />);
    const emDashes = screen.getAllByText("—");
    expect(emDashes.length).toBeGreaterThanOrEqual(1);
  });

  it("displays BPM confidence badge", () => {
    const track = createTrack({
      tech: {
        durationSeconds: 180,
        bpm: 100,
        bpmConfidence: 0.75,
        bpmSource: "id3",
        bpmMethod: "tag",
      },
    });
    renderInTable(<LibraryBrowserTrackRow {...defaultProps} track={track} />);
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("ID3")).toBeInTheDocument();
  });
});
