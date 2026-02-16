import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PlaylistDisplay } from "./PlaylistDisplay";
import type { GeneratedPlaylist } from "@/features/playlists";

const meta: Meta<typeof PlaylistDisplay> = {
  component: PlaylistDisplay,
  tags: ["no-screenshot"],
  parameters: {
    docs: {
      description: {
        component:
          "PlaylistDisplay shows generated playlists with save support in and out of edit mode. " +
          "Save Changes appears when there are unsaved edits (from edit mode or flow arc / track removal).",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof PlaylistDisplay>;

function mockPlaylist(overrides: Partial<GeneratedPlaylist> = {}): GeneratedPlaylist {
  return {
    id: "playlist-story-1",
    title: "Morning Vibes",
    description: "Upbeat playlist for the morning",
    trackFileIds: ["track-1", "track-2"],
    trackSelections: [],
    orderedTracks: [
      { trackFileId: "track-1", position: 0, section: "warmup", reasons: [], transitionScore: 1 },
      { trackFileId: "track-2", position: 1, section: "peak", reasons: [], transitionScore: 0.9 },
    ],
    totalDuration: 360,
    summary: {
      genreMix: new Map([["Rock", 2]]),
      tempoMix: new Map([["medium", 2]]),
      artistMix: new Map([["Artist", 2]]),
      totalDuration: 360,
      trackCount: 2,
      avgDuration: 180,
      minDuration: 120,
      maxDuration: 240,
    },
    strategy: {
      title: "Test",
      description: "Test",
      constraints: {},
      scoringWeights: {},
      diversityRules: {},
      orderingPlan: { sections: [{ name: "peak", startPosition: 0, endPosition: 1 }] },
      vibeTags: [],
      tempoGuidance: {},
      genreMixGuidance: {},
    } as GeneratedPlaylist["strategy"],
    createdAt: Date.now(),
    ...overrides,
  };
}

export const Default: Story = {
  args: {
    playlist: mockPlaylist(),
    playlistCollectionId: "root-1",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Requires sessionStorage with playlist-request and generated-playlist. " +
          "In a real app, Edit Mode and Save Changes appear when the user makes edits.",
      },
    },
  },
  decorators: [
    (Story) => {
      if (typeof window !== "undefined") {
        const playlist = mockPlaylist();
        sessionStorage.setItem(
          "playlist-request",
          JSON.stringify({
            genres: ["Rock"],
            length: { type: "tracks" as const, value: 10 },
            mood: [],
            activity: [],
            tempo: {},
            surprise: 0,
          })
        );
        sessionStorage.setItem(
          "generated-playlist",
          JSON.stringify({
            ...playlist,
            summary: {
              genreMix: Object.fromEntries(playlist.summary.genreMix),
              tempoMix: Object.fromEntries(playlist.summary.tempoMix),
              artistMix: Object.fromEntries(playlist.summary.artistMix),
              totalDuration: playlist.summary.totalDuration,
              trackCount: playlist.summary.trackCount,
              avgDuration: playlist.summary.avgDuration,
              minDuration: playlist.summary.minDuration,
              maxDuration: playlist.summary.maxDuration,
            },
          })
        );
      }
      return <Story />;
    },
  ],
};
