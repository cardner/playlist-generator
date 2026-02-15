import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { within, userEvent, expect } from "storybook/test";
import { SpotifyImport } from "./SpotifyImport";

const meta: Meta<typeof SpotifyImport> = {
  component: SpotifyImport,
  args: {
    onImportComplete: () => undefined,
    onClose: () => undefined,
  },
  tags: ["no-screenshot"],
};

export default meta;

type Story = StoryObj<typeof SpotifyImport>;

const libraryJson = JSON.stringify({
  tracks: [
    {
      artist: "Artist A",
      album: "Album A",
      track: "Song A",
      uri: "spotify:track:abc123",
    },
  ],
});

const playlistJson = JSON.stringify({
  playlists: [
    {
      name: "Sample Playlist",
      lastModifiedDate: "2024-01-01",
      items: [
        {
          track: {
            trackName: "Song A",
            artistName: "Artist A",
            albumName: "Album A",
            trackUri: "spotify:track:abc123",
          },
          addedDate: "2024-01-02",
        },
      ],
    },
  ],
});

const uploadFiles = async (canvasElement: HTMLElement) => {
  const input = canvasElement.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) {
    throw new Error("File input not found");
  }
  const libraryFile = new File([libraryJson], "YourLibrary.json", { type: "application/json" });
  const playlistFile = new File([playlistJson], "Playlist1.json", { type: "application/json" });
  await userEvent.upload(input, [libraryFile, playlistFile]);
};

export const Empty: Story = {};

export const FilesSelected: Story = {
  play: async ({ canvasElement }) => {
    await uploadFiles(canvasElement);
    const canvas = within(canvasElement);
    await expect(canvas.getByText("2 files selected")).toBeInTheDocument();
  },
};

export const ParsedPreview: Story = {
  play: async ({ canvasElement }) => {
    await uploadFiles(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Parse Files" }));
    await expect(canvas.getByText("Import Preview")).toBeInTheDocument();
    await expect(canvas.getByText("Tracks")).toBeInTheDocument();
    await expect(canvas.getByText("Playlists")).toBeInTheDocument();
  },
};

export const WithPlaylistsToggle: Story = {
  play: async ({ canvasElement }) => {
    await uploadFiles(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Parse Files" }));
    const toggle = canvas.getByRole("checkbox");
    await userEvent.click(toggle);
    await expect(toggle).toBeChecked();
  },
};
