import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { within, userEvent, expect } from "storybook/test";
import { DeviceSyncPanel } from "./DeviceSyncPanel";
import type { DeviceProfileRecord } from "@/db/schema";

const meta: Meta<typeof DeviceSyncPanel> = {
  component: DeviceSyncPanel,
  tags: ["no-screenshot"],
  parameters: {
    docs: {
      description: {
        component:
          "Panel for syncing playlists to USB devices. Layout: two columns — left (alerts, device form, iPod collection sync with search and Tracks | Albums | Artists tabs) and right sidebar (device status, Ready to Sync counts, Sync/Detect buttons, Saved Playlists). " +
          "When the device is an iPod, the panel shows iPod collection sync (table/grids) and an option to replace an existing playlist on the device (same name).",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof DeviceSyncPanel>;

const ipodProfile: DeviceProfileRecord = {
  id: "story-ipod-1",
  label: "iPod Classic",
  deviceType: "ipod",
  playlistFormat: "m3u",
  playlistFolder: "",
  pathStrategy: "relative-to-library-root",
  lastSyncAt: 0,
  handleRef: undefined,
  createdAt: 0,
  updatedAt: 0,
};

export const iPodPreset: Story = {
  args: {
    deviceProfileOverride: ipodProfile,
    showDeviceSelector: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "When the device preset is iPod, the panel shows a two-column layout: left — iPod collection sync (search, Tracks | Albums | Artists tabs with table/grids) and right sidebar — Ready to Sync counts (Tracks, Albums, Artists, Playlists, Total Tracks), Sync button, and " +
          '"Replace existing playlist on device if same name" checkbox.',
      },
    },
  },
};

export const iPodPresetWithOverwriteChecked: Story = {
  args: {
    deviceProfileOverride: ipodProfile,
    showDeviceSelector: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Same as iPod preset. The overwrite checkbox (Replace existing playlist on device if same name) " +
          "lets you opt in to replacing an existing device playlist that has the same name as the synced playlist. " +
          "This interaction is covered by unit tests in device-sync-panel-ui.test.tsx.",
      },
    },
  },
};

export const iPodPresetAlbumsTab: Story = {
  args: {
    deviceProfileOverride: ipodProfile,
    showDeviceSelector: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "iPod preset with Albums tab selected. Demonstrates the collection tabs (Tracks, Albums, Artists) and album grid view. Album cards show cover art from the artwork cache when available (from library scan); otherwise a music-note placeholder.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("iPod Collection Sync");
    const albumsTab = await canvas.findByRole("tab", { name: /albums/i });
    await userEvent.click(albumsTab);
    await expect(albumsTab).toHaveAttribute("data-state", "active");
  },
};

export const iPodPresetArtistsTab: Story = {
  args: {
    deviceProfileOverride: ipodProfile,
    showDeviceSelector: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "iPod preset with Artists tab selected. Artist cards show representative artwork from the cache when available; otherwise the first letter of the artist name.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("iPod Collection Sync");
    const artistsTab = await canvas.findByRole("tab", { name: /artists/i });
    await userEvent.click(artistsTab);
    await expect(artistsTab).toHaveAttribute("data-state", "active");
  },
};

const walkmanProfile: DeviceProfileRecord = {
  id: "story-walkman-1",
  label: "Walkman NW-A55",
  deviceType: "walkman",
  playlistFormat: "m3u",
  playlistFolder: "MUSIC",
  pathStrategy: "relative-to-playlist",
  lastSyncAt: 0,
  handleRef: "handle-walkman",
  createdAt: 0,
  updatedAt: 0,
};

export const WalkmanPreset: Story = {
  args: {
    deviceProfileOverride: walkmanProfile,
    showDeviceSelector: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "When the device preset is Walkman, the panel shows the same collection sync layout as iPod: collection selector, search, Tracks | Albums | Artists tabs. " +
          "Actions are 'Sync selected to Walkman' and 'Sync full collection' (no mirror delete).",
      },
    },
  },
};

export const WalkmanPresetAlbumsTab: Story = {
  args: {
    deviceProfileOverride: walkmanProfile,
    showDeviceSelector: false,
  },
  parameters: {
    docs: {
      description: {
        story: "Walkman preset with Albums tab selected.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Walkman Collection Sync");
    const albumsTab = await canvas.findByRole("tab", { name: /albums/i });
    await userEvent.click(albumsTab);
    await expect(albumsTab).toHaveAttribute("data-state", "active");
  },
};

const genericProfile: DeviceProfileRecord = {
  id: "story-generic-1",
  label: "USB Drive",
  deviceType: "generic",
  playlistFormat: "m3u",
  playlistFolder: "PLAYLISTS",
  pathStrategy: "relative-to-playlist",
  lastSyncAt: 0,
  handleRef: "handle-generic",
  createdAt: 0,
  updatedAt: 0,
};

export const GenericPreset: Story = {
  args: {
    deviceProfileOverride: genericProfile,
    showDeviceSelector: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Generic USB preset with collection sync. Shows Collection Sync (selector, tabs) and device settings (Playlist Format, Playlist Folder, Path Strategy).",
      },
    },
  },
};

const zuneProfile: DeviceProfileRecord = {
  id: "story-zune-1",
  label: "Zune HD",
  deviceType: "zune",
  playlistFormat: "m3u",
  playlistFolder: "playlists",
  pathStrategy: "relative-to-playlist",
  lastSyncAt: 0,
  handleRef: "handle-zune",
  createdAt: 0,
  updatedAt: 0,
};

export const ZunePreset: Story = {
  args: {
    deviceProfileOverride: zuneProfile,
    showDeviceSelector: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Zune preset with collection sync. Same layout as Generic with collection selector and device settings.",
      },
    },
  },
};

const jellyfinProfile: DeviceProfileRecord = {
  id: "story-jellyfin-1",
  label: "Jellyfin (Docker)",
  deviceType: "jellyfin",
  playlistFormat: "m3u",
  playlistFolder: "",
  pathStrategy: "relative-to-library-root",
  lastSyncAt: 0,
  handleRef: undefined,
  createdAt: 0,
  updatedAt: 0,
};

export const JellyfinPreset: Story = {
  args: {
    deviceProfileOverride: jellyfinProfile,
    showDeviceSelector: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Jellyfin preset with collection export. Shows Jellyfin Collection Export with collection selector, search, Tracks | Albums | Artists tabs. " +
          "Actions are 'Export selected' and 'Export full collection'.",
      },
    },
  },
};
