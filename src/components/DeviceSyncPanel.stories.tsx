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
          "Same as iPod preset. Play function checks the overwrite checkbox to opt in to replacing an existing " +
          "device playlist that has the same name as the synced playlist.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = await canvas.findByRole("checkbox", {
      name: /replace existing playlist on device if same name/i,
    });
    await userEvent.click(checkbox);
    await expect(checkbox).toBeChecked();
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
