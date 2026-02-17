import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
  getDeviceTrackMappings: jest.fn(async () => []),
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
  supportsFileSystemAccess: jest.fn(() => false),
  supportsWebUSB: jest.fn(() => false),
}));

jest.mock("@/lib/library-selection-fs-api", () => ({
  getDirectoryHandle: jest.fn(async () => null),
  storeDirectoryHandle: jest.fn(async () => null),
  verifyDeviceConnection: jest.fn(async () => false),
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

jest.mock("@/features/library/track-identity", () => ({
  findFileIndexByGlobalTrackId: jest.fn(async () => undefined),
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

    expect(await screen.findByText("Sync to iPod")).toBeInTheDocument();
    expect(await screen.findByText("Mirror collection to iPod")).toBeInTheDocument();
    expect(
      await screen.findByText("Also delete removed tracks from the iPod storage.")
    ).toBeInTheDocument();
  });
});

const ipodProfileOverride = {
  id: "dev-1",
  label: "iPod Classic",
  deviceType: "ipod" as const,
  playlistFormat: "m3u" as const,
  playlistFolder: "",
  pathStrategy: "relative-to-library-root" as const,
  handleRef: "handle-1",
};

describe("DeviceSyncPanel iPod overwrite playlist option", () => {
  it("shows overwrite existing playlist checkbox when iPod preset", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={ipodProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("iPod Collection Sync")).toBeInTheDocument();
    });

    const checkbox = await screen.findByRole("checkbox", {
      name: /replace existing playlist on device if same name/i,
    });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it("overwrite checkbox is togglable", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={ipodProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("iPod Collection Sync")).toBeInTheDocument();
    });

    const checkbox = await screen.findByRole("checkbox", {
      name: /replace existing playlist on device if same name/i,
    });
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("does not show overwrite checkbox when device is not iPod", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={{
          ...ipodProfileOverride,
          deviceType: "generic",
          id: "dev-generic",
        }}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText("iPod Collection Sync")).not.toBeInTheDocument();
    });

    expect(
      screen.queryByRole("checkbox", {
        name: /replace existing playlist on device if same name/i,
      })
    ).not.toBeInTheDocument();
  });
});

describe("DeviceSyncPanel iPod collection tabs and sidebar", () => {
  it("shows Ready to Sync counts in sidebar when iPod preset", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={ipodProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("iPod Collection Sync")).toBeInTheDocument();
    });

    expect(screen.getByText("Ready to Sync")).toBeInTheDocument();
    expect(screen.getByText("Tracks")).toBeInTheDocument();
    expect(screen.getByText("Albums")).toBeInTheDocument();
    expect(screen.getByText("Artists")).toBeInTheDocument();
    expect(screen.getByText("Playlists")).toBeInTheDocument();
    expect(screen.getByText("Total Tracks")).toBeInTheDocument();
  });

  it("shows Tracks, Albums, Artists tabs with counts", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={ipodProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("iPod Collection Sync")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /Select visible/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: /tracks/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /albums/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /artists/i })).toBeInTheDocument();

    // Switch to Albums tab and verify we can switch back to Tracks
    const albumsTab = screen.getByRole("tab", { name: /albums/i });
    fireEvent.click(albumsTab);
    const tracksTab = screen.getByRole("tab", { name: /tracks/i });
    fireEvent.click(tracksTab);
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /Select visible/i })).toBeInTheDocument();
    });
  });

  it("Tracks tab shows table and header select-visible checkbox when collection ready", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={ipodProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("iPod Collection Sync")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /Select visible/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("columnheader", { name: /Title/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Artist/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Album/i })).toBeInTheDocument();
  });
});

const walkmanProfileOverride = {
  id: "dev-walkman-1",
  label: "Walkman NW-A55",
  deviceType: "walkman" as const,
  playlistFormat: "m3u" as const,
  playlistFolder: "MUSIC",
  pathStrategy: "relative-to-playlist" as const,
  handleRef: "handle-walkman",
};

describe("DeviceSyncPanel Walkman collection sync", () => {
  it("renders collection sync UI for Walkman with correct labels", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={walkmanProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Walkman Collection Sync")).toBeInTheDocument();
    });

    expect(await screen.findByText("Sync selected to Walkman")).toBeInTheDocument();
    expect(await screen.findByText("Sync full collection")).toBeInTheDocument();
    expect(screen.queryByText("Also delete removed tracks")).not.toBeInTheDocument();
  });

  it("shows Tracks, Albums, Artists tabs for Walkman", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={walkmanProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Walkman Collection Sync")).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: /tracks/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /albums/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /artists/i })).toBeInTheDocument();
  });
});

const genericProfileOverride = {
  id: "dev-generic-1",
  label: "USB Drive",
  deviceType: "generic" as const,
  playlistFormat: "m3u" as const,
  playlistFolder: "PLAYLISTS",
  pathStrategy: "relative-to-playlist" as const,
  handleRef: "handle-generic",
};

const zuneProfileOverride = {
  id: "dev-zune-1",
  label: "Zune HD",
  deviceType: "zune" as const,
  playlistFormat: "m3u" as const,
  playlistFolder: "playlists",
  pathStrategy: "relative-to-playlist" as const,
  handleRef: "handle-zune",
};

describe("DeviceSyncPanel Generic and Zune collection sync", () => {
  it("renders collection sync UI for Generic preset", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={genericProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Collection Sync")).toBeInTheDocument();
    });

    expect(await screen.findByText("Sync selected")).toBeInTheDocument();
    expect(await screen.findByText("Sync full collection")).toBeInTheDocument();
  });

  it("renders collection sync UI for Zune preset", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={zuneProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Collection Sync")).toBeInTheDocument();
    });

    expect(await screen.findByText("Sync selected to Zune")).toBeInTheDocument();
    expect(await screen.findByText("Sync full collection")).toBeInTheDocument();
  });

  it("shows device settings for Generic preset", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={genericProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Collection Sync")).toBeInTheDocument();
    });

    expect(screen.getByText("Playlist Format")).toBeInTheDocument();
    expect(screen.getByText("Playlist Folder")).toBeInTheDocument();
  });
});

const jellyfinProfileOverride = {
  id: "dev-jellyfin-1",
  label: "Jellyfin (Docker)",
  deviceType: "jellyfin" as const,
  playlistFormat: "m3u" as const,
  playlistFolder: "",
  pathStrategy: "relative-to-library-root" as const,
};

describe("DeviceSyncPanel Jellyfin collection export", () => {
  it("renders collection export UI for Jellyfin preset", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={jellyfinProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Jellyfin Collection Export")).toBeInTheDocument();
    });

    expect(await screen.findByText("Export selected")).toBeInTheDocument();
    expect(await screen.findByText("Export full collection")).toBeInTheDocument();
  });

  it("does not show On device column for Jellyfin", async () => {
    render(
      <DeviceSyncPanel
        deviceProfileOverride={jellyfinProfileOverride}
        showDeviceSelector={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Jellyfin Collection Export")).toBeInTheDocument();
    });

    expect(screen.queryByText("On device")).not.toBeInTheDocument();
  });
});
