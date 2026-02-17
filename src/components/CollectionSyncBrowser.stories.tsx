import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { within, userEvent, expect } from "storybook/test";
import { CollectionSyncBrowser } from "./CollectionSyncBrowser";

const meta: Meta<typeof CollectionSyncBrowser> = {
  component: CollectionSyncBrowser,
  tags: ["no-screenshot"],
  parameters: {
    docs: {
      description: {
        component:
          "Reusable UI for browsing a collection's tracks with Tracks | Albums | Artists tabs, " +
          "selection, search, and sync/export actions. Used by DeviceSyncPanel for iPod, Walkman, Generic, Zune, and Jellyfin presets.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof CollectionSyncBrowser>;

const sampleTracks = [
  {
    trackFileId: "t1",
    title: "Track One",
    artist: "Artist A",
    album: "Album 1",
    onDevice: true,
  },
  {
    trackFileId: "t2",
    title: "Track Two",
    artist: "Artist A",
    album: "Album 1",
    onDevice: false,
  },
  {
    trackFileId: "t3",
    title: "Track Three",
    artist: "Artist B",
    album: "Album 2",
    onDevice: null,
  },
];

const defaultArgs = {
  title: "Collection Sync",
  description: "Select tracks, albums, and artists to sync to your device.",
  collectionId: "col-1",
  collections: [
    { id: "col-1", name: "Collection A" },
    { id: "col-2", name: "Collection B" },
  ],
  selectedCollectionId: "col-1",
  onCollectionChange: () => {},
  search: "",
  onSearchChange: () => {},
  tracks: sampleTracks,
  status: "ready" as const,
  error: null,
  selectedTrackIds: new Set<string>(),
  onSelectedTrackIdsChange: () => {},
  tab: "tracks" as const,
  onTabChange: () => {},
  artworkUrlMap: new Map<string, string>(),
  onSyncSelected: () => {},
  onMirrorCollection: () => {},
  syncLabel: "Sync selected",
  mirrorLabel: "Sync full collection",
  showOnDeviceColumn: true,
  onDeviceLabel: "On device",
  isSyncing: false,
};

export const Default: Story = {
  args: defaultArgs,
};

export const WithOnDeviceColumn: Story = {
  args: {
    ...defaultArgs,
    showOnDeviceColumn: true,
  },
};

export const ExportMode: Story = {
  args: {
    ...defaultArgs,
    syncLabel: "Export selected",
    mirrorLabel: "Export full collection",
  },
};

export const AlbumsTab: Story = {
  args: {
    ...defaultArgs,
    onTabChange: undefined,
  },
  decorators: [
    (Story, context) => {
      const [tab, setTab] = useState<"tracks" | "albums" | "artists">("tracks");
      return (
        <CollectionSyncBrowser
          {...(context.args as object)}
          tab={tab}
          onTabChange={(v) => setTab(v as "tracks" | "albums" | "artists")}
        />
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const albumsTab = await canvas.findByRole("tab", { name: /albums/i });
    await userEvent.click(albumsTab);
    await expect(albumsTab).toHaveAttribute("data-state", "active");
  },
};

export const ArtistsTab: Story = {
  args: {
    ...defaultArgs,
    onTabChange: undefined,
  },
  decorators: [
    (Story, context) => {
      const [tab, setTab] = useState<"tracks" | "albums" | "artists">("tracks");
      return (
        <CollectionSyncBrowser
          {...(context.args as object)}
          tab={tab}
          onTabChange={(v) => setTab(v as "tracks" | "albums" | "artists")}
        />
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const artistsTab = await canvas.findByRole("tab", { name: /artists/i });
    await userEvent.click(artistsTab);
    await expect(artistsTab).toHaveAttribute("data-state", "active");
  },
};

export const Loading: Story = {
  args: {
    ...defaultArgs,
    status: "loading",
    tracks: [],
  },
};

export const Error: Story = {
  args: {
    ...defaultArgs,
    status: "error",
    error: "Failed to load collection tracks",
    tracks: [],
  },
};
