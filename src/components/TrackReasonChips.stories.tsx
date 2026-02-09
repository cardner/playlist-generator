import type { TrackReason } from "@/features/playlists";
import { Meta, StoryObj } from "@storybook/react";
import { TrackReasonChips } from "./TrackReasonChips";

const sampleReasons: TrackReason[] = [
  { type: "genre_match", explanation: "Rock genre match", score: 0.9 },
  { type: "tempo_match", explanation: "Tempo 120 BPM", score: 0.8 },
  { type: "duration_fit", explanation: "Fits remaining slot", score: 0.7 },
];

const meta: Meta<typeof TrackReasonChips> = {
  component: TrackReasonChips,
};

export default meta;

type Story = StoryObj<typeof TrackReasonChips>;

export const Default: Story = {
  args: { reasons: sampleReasons },
};

export const Compact: Story = {
  args: { reasons: sampleReasons, compact: true },
};
