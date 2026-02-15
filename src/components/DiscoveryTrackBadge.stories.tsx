import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DiscoveryTrackBadge } from "./DiscoveryTrackBadge";

const meta: Meta<typeof DiscoveryTrackBadge> = {
  component: DiscoveryTrackBadge,
};

export default meta;

type Story = StoryObj<typeof DiscoveryTrackBadge>;

export const Default: Story = {};

export const WithTooltip: Story = {
  args: {
    showTooltip: true,
    explanation: "Suggested because it's similar to 'Bohemian Rhapsody'",
  },
};
