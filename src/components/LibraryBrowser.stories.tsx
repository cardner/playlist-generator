import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LibraryBrowser } from "./LibraryBrowser";

const meta: Meta<typeof LibraryBrowser> = {
  component: LibraryBrowser,
  tags: ["no-screenshot"],
  parameters: {
    docs: {
      description: {
        component:
          "Library browser with Tracks | Albums | Artists tabs. " +
          "Tracks tab shows a searchable, sortable table with pagination and metadata writeback. " +
          "Albums and Artists tabs show card grids; clicking a card adds a filter and switches to the Tracks view. " +
          "Requires a loaded library (scan a folder on the Library page) to show data.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof LibraryBrowser>;

export const Default: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: "Default view (Tracks tab). Shows track table when library has data; otherwise empty state.",
      },
    },
  },
};

export const AlbumsView: Story = {
  args: {
    initialViewMode: "albums",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Starts on the Albums tab. Album cards show artwork (from scan), title, artist, and track count. " +
          "Click a card to filter by that album and artist and switch to the Tracks tab.",
      },
    },
  },
};

export const ArtistsView: Story = {
  args: {
    initialViewMode: "artists",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Starts on the Artists tab. Artist cards show representative artwork or initial letter, name, and album/track counts. " +
          "Click a card to filter by that artist and switch to the Tracks tab.",
      },
    },
  },
};
