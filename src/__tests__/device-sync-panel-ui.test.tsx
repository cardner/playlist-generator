import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { DeviceSyncPanel } from "@/components/DeviceSyncPanel";

jest.mock("@/db/storage", () => ({
  getAllCollections: jest.fn(async () => [{ id: "col-1", name: "Collection A" }]),
  getAllTracks: jest.fn(async () => []),
  getFileIndexEntries: jest.fn(async () => []),
  getLibraryRoot: jest.fn(async () => null),
  relinkCollectionHandle: jest.fn(async () => null),
}));

jest.mock("@/db/schema", () => ({
  db: {
    tracks: {
      where: jest.fn(() => ({
        equals: jest.fn(() => ({
          toArray: jest.fn(async () => []),
        })),
      })),
    },
  },
}));

jest.mock("@/features/devices/device-storage", () => ({
  getDeviceProfiles: jest.fn(async () => []),
  getDeviceFileIndexMap: jest.fn(async () => new Map()),
  saveDeviceFileIndexEntries: jest.fn(async () => null),
  saveDeviceProfile: jest.fn(async () => ({ id: "dev-1" })),
}));

jest.mock("@/features/devices/device-sync", () => ({
  checkDeviceWriteAccess: jest.fn(async () => ({ ok: true })),
  pickDeviceRootHandle: jest.fn(async () => ({ handleId: "handle", name: "USB" })),
  syncPlaylistsToDevice: jest.fn(async () => ({})),
  validatePlaylistOnDevice: jest.fn(async () => ({ total: 0, missing: 0, missingSamples: [] })),
}));

jest.mock("@/features/devices/device-scan", () => ({
  scanDeviceForPaths: jest.fn(async () => ({ pathMap: new Map(), entries: [] })),
  buildDeviceMatchCandidates: jest.fn(() => []),
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
  supportsFileSystemAccess: jest.fn(() => false),
  supportsWebUSB: jest.fn(() => false),
}));

jest.mock("@/lib/library-selection-fs-api", () => ({
  getDirectoryHandle: jest.fn(async () => null),
  storeDirectoryHandle: jest.fn(async () => null),
}));

jest.mock("@/lib/library-selection-permissions", () => ({
  requestLibraryPermission: jest.fn(async () => null),
}));

jest.mock("@/lib/library-selection-root", () => ({
  getSavedLibraryRoot: jest.fn(async () => null),
}));

jest.mock("@/features/library/scanning-persist", () => ({
  scanLibraryWithPersistence: jest.fn(async () => null),
}));

jest.mock("@/components/Modal", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("DeviceSyncPanel iPod collection UI", () => {
  it("renders collection sync actions for iPod devices", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={{
          id: "dev-1",
          label: "iPod Classic",
          deviceType: "ipod",
          playlistFormat: "m3u",
          playlistFolder: "",
          pathStrategy: "relative-to-library-root",
        }}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("iPod Collection Sync")).toBeInTheDocument();
    });

    expect(await screen.findByText("Sync selected to iPod")).toBeInTheDocument();
    expect(screen.getByText("Mirror collection to iPod")).toBeInTheDocument();
    expect(
      screen.getByText("Also delete removed tracks from the iPod storage.")
    ).toBeInTheDocument();
  });
});
