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
          "Panel for syncing playlists to USB devices. When the device is an iPod, " +
          "an option to replace an existing playlist on the device (same name) is shown.",
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
          "When the device preset is iPod, the panel shows iPod collection sync and the " +
          '"Replace existing playlist on device if same name" checkbox above the Sync button.',
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
          "Same as iPod preset. Use the checkbox to opt in to replacing an existing " +
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
