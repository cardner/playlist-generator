import { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

function DialogWrapper({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {defaultOpen ? "Already open" : "Open dialog"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Save Playlist">
        <Dialog.Body>Dialog content goes here.</Dialog.Body>
        <Dialog.Footer>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Save
          </Button>
        </Dialog.Footer>
      </Dialog>
    </>
  );
}

const meta: Meta<typeof Dialog> = {
  component: Dialog,
};

export default meta;

type Story = StoryObj<typeof Dialog>;

export const Closed: Story = {
  render: () => <DialogWrapper defaultOpen={false} />,
};

export const Open: Story = {
  render: () => <DialogWrapper defaultOpen={true} />,
};
