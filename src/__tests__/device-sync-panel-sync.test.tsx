/**
 * Integration tests for DeviceSyncPanel sync/export actions.
 * Verifies handleSyncSelectedTracks and handleExportSelectedTracks call the correct APIs.
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DeviceSyncPanel } from "@/components/DeviceSyncPanel";

const mockSyncPlaylistsToDevice = jest.fn(async () => ({}));
const mockGetFileIndexEntries = jest.fn(async () => [
  { trackFileId: "t1", name: "track1.mp3", size: 1000, updatedAt: 1000 },
]);

let mockCollectionTracks: Array<{
  trackFileId: string;
  tags?: { title?: string; artist?: string; album?: string };
  updatedAt: number;
}> = [];

const mockGetFileIndexEntry = jest.fn(async (trackFileId: string) =>
  trackFileId === "t1"
    ? { trackFileId: "t1", name: "track1.mp3", size: 1000, relativePath: "Music/track1.mp3" }
    : undefined
);

jest.mock("@/db/storage", () => ({
  getAllCollections: jest.fn(async () => [{ id: "col-1", name: "Collection A" }]),
  getAllTracks: jest.fn(async () => []),
  getFileIndexEntries: (...args: unknown[]) => mockGetFileIndexEntries(...args),
  getFileIndexEntry: (...args: unknown[]) => mockGetFileIndexEntry(...args),
  getLibraryRoot: jest.fn(async (id: string) =>
    id === "col-1"
      ? { id: "col-1", handleRef: "handle-col-1", mode: "handle" as const }
      : undefined
  ),
  relinkCollectionHandle: jest.fn(async () => null),
  requestLibraryPermission: jest.fn(async () => "granted"),
}));

jest.mock("@/db/schema", () => ({
  db: {
    tracks: {
      where: () => ({
        equals: () => ({
          toArray: async () => mockCollectionTracks,
        }),
      }),
    },
    artworkCache: {
      bulkGet: jest.fn(async () => []),
    },
  },
  getCompositeId: (a: string, b: string) => `${a}-${b}`,
}));

jest.mock("@/features/devices/device-storage", () => ({
  getDeviceProfiles: jest.fn(async () => []),
  getDeviceFileIndexMap: jest.fn(async () => new Map()),
  getDeviceTrackMappings: jest.fn(async () => []),
  saveDeviceFileIndexEntries: jest.fn(async () => null),
  saveDeviceProfile: jest.fn(async (input: { id?: string }) => ({
    id: input.id ?? "dev-1",
    label: "Walkman",
    deviceType: "walkman",
    handleRef: "handle-1",
  })),
}));

jest.mock("@/features/devices/device-sync", () => ({
  checkDeviceWriteAccess: jest.fn(async () => ({ ok: true })),
  pickDeviceRootHandle: jest.fn(async () => ({ handleId: "handle", name: "USB" })),
  syncPlaylistsToDevice: (...args: unknown[]) => mockSyncPlaylistsToDevice(...args),
  validatePlaylistOnDevice: jest.fn(async () => ({ total: 0, missing: 0, missingSamples: [] })),
}));

jest.mock("@/features/devices/device-scan", () => ({
  scanDeviceForPaths: jest.fn(async () => ({
    pathMap: new Map(),
    entries: [],
    finalProgress: { scanned: 0, matched: 0, hashed: 0 },
  })),
  buildDeviceMatchCandidates: jest.fn(() => []),
  isTrackOnDeviceUsb: jest.fn(() => false),
}));

jest.mock("@/features/devices/ipod", () => ({
  getDeviceViaWebUSB: jest.fn(async () => null),
  getModelInfo: jest.fn(() => null),
  isSysInfoSetup: jest.fn(async () => true),
  listKnownIpodDevices: jest.fn(async () => []),
  loadIpodDeviceInfo: jest.fn(async () => null),
  loadIpodTracks: jest.fn(async () => []),
  requiresEncryption: jest.fn(() => false),
  startIpodConnectionMonitor: jest.fn(() => ({
    suspend: jest.fn(),
    resume: jest.fn(),
    stop: jest.fn(),
  })),
  verifyIpodStructure: jest.fn(async () => true),
  writeSysInfoSetup: jest.fn(async () => null),
}));

jest.mock("@/lib/feature-detection", () => ({
  supportsFileSystemAccess: jest.fn(() => true),
  supportsWebUSB: jest.fn(() => false),
}));

jest.mock("@/lib/library-selection-fs-api", () => ({
  getDirectoryHandle: jest.fn(async () => ({
    queryPermission: jest.fn(async () => "granted"),
    requestPermission: jest.fn(async () => "granted"),
  })),
  storeDirectoryHandle: jest.fn(async () => null),
  verifyDeviceConnection: jest.fn(async () => true),
}));

jest.mock("@/lib/library-selection-permissions", () => ({
  requestLibraryPermission: jest.fn(async () => "granted"),
}));

jest.mock("@/lib/library-selection-root", () => ({
  getSavedLibraryRoot: jest.fn(async () => null),
}));

jest.mock("@/features/library/scanning-persist", () => ({
  scanLibraryWithPersistence: jest.fn(async () => null),
}));

jest.mock("@/features/library/track-identity", () => ({
  findFileIndexByGlobalTrackId: jest.fn(async () => undefined),
}));

jest.mock("@/components/Modal", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const walkmanProfileOverride = {
  id: "dev-walkman-1",
  label: "Walkman NW-A55",
  deviceType: "walkman" as const,
  playlistFormat: "m3u" as const,
  playlistFolder: "MUSIC",
  pathStrategy: "relative-to-playlist" as const,
  handleRef: "handle-walkman",
};

describe("DeviceSyncPanel sync actions", () => {
  beforeEach(() => {
    mockSyncPlaylistsToDevice.mockClear();
    mockCollectionTracks = [
      {
        trackFileId: "t1",
        tags: { title: "Track 1", artist: "Artist", album: "Album" },
        updatedAt: 1000,
      },
    ];
  });

  it("calls syncPlaylistsToDevice when Sync selected clicked for Walkman with track selected", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={walkmanProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Walkman Collection Sync")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /Select visible/i })).toBeInTheDocument();
    });

    const selectVisibleCheckbox = screen.getByRole("checkbox", {
      name: /Select visible/i,
    });
    fireEvent.click(selectVisibleCheckbox);

    const syncButton = screen.getByRole("button", {
      name: /Sync selected to Walkman/i,
    });
    expect(syncButton).not.toBeDisabled();
    fireEvent.click(syncButton);

    await waitFor(
      () => {
        expect(mockSyncPlaylistsToDevice).toHaveBeenCalled();
        const call = mockSyncPlaylistsToDevice.mock.calls[0][0];
        expect(call.targets).toBeDefined();
        expect(call.targets).toHaveLength(1);
        expect(call.targets[0].playlist.trackFileIds).toContain("t1");
      },
      { timeout: 3000 }
    );
  });
});
