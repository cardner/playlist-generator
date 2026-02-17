import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DeviceSyncSidebar } from "./DeviceSyncSidebar";
import { buildSyntheticPlaylist } from "@/features/devices/sync-targets";

const meta: Meta<typeof DeviceSyncSidebar> = {
  component: DeviceSyncSidebar,
  tags: ["no-screenshot"],
  parameters: {
    docs: {
      description: {
        component:
          "Sidebar for device sync showing device header, capacity, Ready to Sync counts, " +
          "Sync/Scan/Export buttons, and Saved Playlists. Used by DeviceSyncPanel.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof DeviceSyncSidebar>;

const defaultArgs = {
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
      playlist: buildSyntheticPlaylist("Rock Mix", ["t1", "t2", "t3"]),
      libraryRootId: "col-1",
      collectionName: "Collection A",
    },
  ],
  selectedPlaylistIds: [] as string[],
  onSelectedPlaylistIdsChange: () => {},
  onSync: () => {},
  onScan: () => {},
  isSyncing: false,
  syncButtonLabel: "Sync to Walkman",
  showScanButton: true,
  showExportButton: false,
};

export const WalkmanPreset: Story = {
  args: defaultArgs,
};

export const WithCapacity: Story = {
  args: {
    ...defaultArgs,
    capacityInfo: { usedBytes: 5e9, capacityGb: 32 },
  },
};

export const NotConnected: Story = {
  args: {
    ...defaultArgs,
    deviceHandleRef: null,
    isDeviceConnected: false,
  },
};

export const iPodPreset: Story = {
  args: {
    ...defaultArgs,
    devicePreset: "ipod",
    deviceLabel: "iPod Classic",
    syncButtonLabel: "Sync to iPod",
  },
};

export const JellyfinPreset: Story = {
  args: {
    ...defaultArgs,
    devicePreset: "jellyfin",
    deviceLabel: "Jellyfin (Docker)",
    isDeviceConnected: true,
    showScanButton: false,
    showExportButton: true,
    onExport: () => {},
  },
};

export const Syncing: Story = {
  args: {
    ...defaultArgs,
    isSyncing: true,
  },
};

export const NoPlaylists: Story = {
  args: {
    ...defaultArgs,
    playlists: [],
  },
};
