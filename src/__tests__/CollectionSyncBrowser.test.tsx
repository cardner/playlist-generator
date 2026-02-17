/**
 * Unit tests for CollectionSyncBrowser component.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollectionSyncBrowser } from "@/components/CollectionSyncBrowser";

const defaultProps = {
  title: "Collection Sync",
  collectionId: "col-1",
  collections: [
    { id: "col-1", name: "Collection A" },
    { id: "col-2", name: "Collection B" },
  ],
  selectedCollectionId: "col-1",
  onCollectionChange: () => {},
  search: "",
  onSearchChange: () => {},
  tracks: [
    {
      trackFileId: "t1",
      title: "Track 1",
      artist: "Artist A",
      album: "Album 1",
      onDevice: null,
    },
    {
      trackFileId: "t2",
      title: "Track 2",
      artist: "Artist A",
      album: "Album 1",
      onDevice: true,
    },
  ],
  status: "ready" as const,
  error: null,
  selectedTrackIds: new Set<string>(),
  onSelectedTrackIdsChange: () => {},
  tab: "tracks" as const,
  onTabChange: () => {},
  artworkUrlMap: new Map<string, string>(),
  onSyncSelected: jest.fn(),
  onMirrorCollection: jest.fn(),
  syncLabel: "Sync selected",
  mirrorLabel: "Sync full collection",
};

describe("CollectionSyncBrowser", () => {
  it("renders title and description", () => {
    render(<CollectionSyncBrowser {...defaultProps} description="Pick tracks" />);
    expect(screen.getByText("Collection Sync")).toBeInTheDocument();
    expect(screen.getByText("Pick tracks")).toBeInTheDocument();
  });

  it("renders collection selector with options", () => {
    render(<CollectionSyncBrowser {...defaultProps} />);
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Collection A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Collection B" })).toBeInTheDocument();
  });

  it("renders search input", () => {
    render(<CollectionSyncBrowser {...defaultProps} />);
    expect(
      screen.getByPlaceholderText(/Search: title, artist, album/)
    ).toBeInTheDocument();
  });

  it("renders Tracks, Albums, Artists tabs", () => {
    render(<CollectionSyncBrowser {...defaultProps} />);
    expect(screen.getByRole("tab", { name: /tracks/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /albums/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /artists/i })).toBeInTheDocument();
  });

  it("renders Sync selected and Sync full collection buttons when handlers provided", () => {
    render(<CollectionSyncBrowser {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Sync selected/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync full collection/i })).toBeInTheDocument();
  });

  it("calls onSyncSelected when Sync selected clicked", () => {
    const onSyncSelected = jest.fn();
    render(
      <CollectionSyncBrowser
        {...defaultProps}
        onSyncSelected={onSyncSelected}
        selectedTrackIds={new Set(["t1"])}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Sync selected/i }));
    expect(onSyncSelected).toHaveBeenCalled();
  });

  it("calls onMirrorCollection when Sync full collection clicked", () => {
    const onMirrorCollection = jest.fn();
    render(
      <CollectionSyncBrowser
        {...defaultProps}
        onMirrorCollection={onMirrorCollection}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Sync full collection/i }));
    expect(onMirrorCollection).toHaveBeenCalled();
  });

  it("shows loading state when status is loading", () => {
    render(<CollectionSyncBrowser {...defaultProps} status="loading" />);
    expect(screen.getByText(/Loading collection tracks/i)).toBeInTheDocument();
  });

  it("shows error when status is error", () => {
    render(
      <CollectionSyncBrowser
        {...defaultProps}
        status="error"
        error="Failed to load"
      />
    );
    expect(screen.getByText("Failed to load")).toBeInTheDocument();
  });

  it("renders track table with Title, Artist, Album columns when tab is tracks", () => {
    render(<CollectionSyncBrowser {...defaultProps} />);
    expect(screen.getByRole("columnheader", { name: /Title/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Artist/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Album/i })).toBeInTheDocument();
  });

  it("shows On device label when showOnDeviceColumn is true and track is on device", () => {
    render(
      <CollectionSyncBrowser
        {...defaultProps}
        showOnDeviceColumn={true}
        tracks={[
          {
            ...defaultProps.tracks[0],
            onDevice: true,
          },
        ]}
      />
    );
    expect(screen.getByText("On device")).toBeInTheDocument();
  });

  it("uses custom sync and mirror labels", () => {
    render(
      <CollectionSyncBrowser
        {...defaultProps}
        syncLabel="Export selected"
        mirrorLabel="Export full collection"
      />
    );
    expect(screen.getByRole("button", { name: /Export selected/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export full collection/i })).toBeInTheDocument();
  });
});
