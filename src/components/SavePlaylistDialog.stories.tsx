import { useState } from "react";
import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SavePlaylistDialog } from "./SavePlaylistDialog";

const meta: Meta<typeof SavePlaylistDialog> = {
  component: SavePlaylistDialog,
  tags: ["no-screenshot"],
};

export default meta;

type Story = StoryObj<typeof SavePlaylistDialog>;

function SavePlaylistDialogWrapper() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open</button>
      <SavePlaylistDialog
        isOpen={isOpen}
        defaultTitle="My Playlist"
        defaultDescription="A great playlist"
        onClose={() => setIsOpen(false)}
        onConfirm={() => setIsOpen(false)}
      />
    </>
  );
}

export const Closed: Story = {
  render: () => <SavePlaylistDialogWrapper />,
};

function SavePlaylistDialogOpen() {
  return (
    <SavePlaylistDialog
      isOpen={true}
      defaultTitle="My Playlist"
      defaultDescription="A great playlist"
      onClose={() => {}}
      onConfirm={() => {}}
    />
  );
}

export const Open: Story = {
  render: () => <SavePlaylistDialogOpen />,
};

export const SaveChangesMode: Story = {
  render: () => (
    <SavePlaylistDialog
      isOpen={true}
      defaultTitle="Morning Vibes"
      defaultDescription="Upbeat playlist for the morning"
      onClose={() => {}}
      onConfirm={() => {}}
      titleText="Save Changes"
      confirmLabel="Save Changes"
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Used when saving edits to an existing saved playlist (in or out of edit mode).",
      },
    },
  },
};
