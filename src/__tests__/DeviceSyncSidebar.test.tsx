/**
 * Unit tests for DeviceSyncSidebar component.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeviceSyncSidebar } from "@/components/DeviceSyncSidebar";

const defaultProps = {
  deviceLabel: "Walkman NW-A55",
  devicePreset: "walkman" as const,
  deviceHandleRef: "handle-1",
  selectedTracksCount: 10,
  selectedAlbumsCount: 2,
  selectedArtistsCount: 1,
  selectedPlaylistsCount: 1,
  totalTracksCount: 10,
  playlists: [
    {
      playlist: {
        id: "p1",
        title: "Rock Mix",
        trackFileIds: ["t1", "t2", "t3"],
      },
      libraryRootId: "col-1",
      collectionName: "Collection A",
    },
  ],
  selectedPlaylistIds: [] as string[],
  onSelectedPlaylistIdsChange: jest.fn(),
  onSync: jest.fn(),
  onScan: jest.fn(),
  isSyncing: false,
  syncButtonLabel: "Sync to Walkman",
  showScanButton: true,
  showExportButton: false,
};

describe("DeviceSyncSidebar", () => {
  it("renders device label", () => {
    render(<DeviceSyncSidebar {...defaultProps} />);
    expect(screen.getByText("Walkman NW-A55")).toBeInTheDocument();
  });

  it("shows Connected when deviceHandleRef is set", () => {
    render(<DeviceSyncSidebar {...defaultProps} />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows Not connected when deviceHandleRef is null", () => {
    render(<DeviceSyncSidebar {...defaultProps} deviceHandleRef={null} />);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("shows Not connected when isDeviceConnected is false even with handleRef", () => {
    render(
      <DeviceSyncSidebar {...defaultProps} deviceHandleRef="handle-1" isDeviceConnected={false} />
    );
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("shows Ready for Jellyfin when connected", () => {
    render(
      <DeviceSyncSidebar
        {...defaultProps}
        devicePreset="jellyfin"
        deviceHandleRef="handle-1"
        isDeviceConnected={true}
      />
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows Not configured for Jellyfin when not connected", () => {
    render(
      <DeviceSyncSidebar
        {...defaultProps}
        devicePreset="jellyfin"
        deviceHandleRef={null}
        isDeviceConnected={false}
      />
    );
    expect(screen.getByText("Not configured")).toBeInTheDocument();
  });

  it("renders Ready to Sync counts", () => {
    render(<DeviceSyncSidebar {...defaultProps} />);
    expect(screen.getByText("Ready to Sync")).toBeInTheDocument();
    expect(screen.getByText("Tracks")).toBeInTheDocument();
    expect(screen.getByText("Albums")).toBeInTheDocument();
    expect(screen.getByText("Artists")).toBeInTheDocument();
    expect(screen.getByText("Playlists")).toBeInTheDocument();
    expect(screen.getByText("Total Tracks")).toBeInTheDocument();
  });

  it("renders Sync button with custom label", () => {
    render(<DeviceSyncSidebar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Sync to Walkman/i })).toBeInTheDocument();
  });

  it("calls onSync when Sync button clicked", () => {
    const onSync = jest.fn();
    render(<DeviceSyncSidebar {...defaultProps} onSync={onSync} />);
    fireEvent.click(screen.getByRole("button", { name: /Sync to Walkman/i }));
    expect(onSync).toHaveBeenCalled();
  });

  it("renders Scan button when showScanButton and onScan provided", () => {
    render(<DeviceSyncSidebar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Not scanned/i })).toBeInTheDocument();
  });

  it("calls onScan when Scan button clicked", () => {
    const onScan = jest.fn();
    render(<DeviceSyncSidebar {...defaultProps} onScan={onScan} />);
    fireEvent.click(screen.getByRole("button", { name: /Not scanned/i }));
    expect(onScan).toHaveBeenCalled();
  });

  it("renders Export button when showExportButton and onExport provided", () => {
    render(
      <DeviceSyncSidebar
        {...defaultProps}
        showExportButton={true}
        onExport={jest.fn()}
        devicePreset="jellyfin"
      />
    );
    expect(screen.getByRole("button", { name: /Export for Jellyfin/i })).toBeInTheDocument();
  });

  it("renders Saved Playlists when playlists provided", () => {
    render(<DeviceSyncSidebar {...defaultProps} />);
    expect(screen.getByText("Saved Playlists")).toBeInTheDocument();
    expect(screen.getByText("Rock Mix")).toBeInTheDocument();
    expect(screen.getByText("Select all")).toBeInTheDocument();
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("shows capacity when capacityInfo provided", () => {
    render(
      <DeviceSyncSidebar
        {...defaultProps}
        capacityInfo={{ usedBytes: 5e9, capacityGb: 32 }}
      />
    );
    expect(screen.getByText(/5\.0 GB of 32 GB used/)).toBeInTheDocument();
  });

  it("shows Capacity N/A when capacityInfo not provided", () => {
    render(<DeviceSyncSidebar {...defaultProps} />);
    expect(screen.getByText("Capacity N/A")).toBeInTheDocument();
  });

  it("disables Sync button when isSyncing", () => {
    render(<DeviceSyncSidebar {...defaultProps} isSyncing={true} />);
    expect(screen.getByRole("button", { name: /Syncing/i })).toBeDisabled();
  });
});
