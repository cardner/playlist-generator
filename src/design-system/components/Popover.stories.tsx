import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Popover } from "./Popover";
import { Button } from "./Button";

function PopoverWrapper({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Popover open={open} onOpenChange={setOpen} trigger={<Button variant="secondary">Toggle</Button>}>
      Popover content
    </Popover>
  );
}

const meta: Meta<typeof Popover> = {
  component: Popover,
};

export default meta;

type Story = StoryObj<typeof Popover>;

export const Closed: Story = {
  render: () => <PopoverWrapper defaultOpen={false} />,
};

export const Open: Story = {
  render: () => <PopoverWrapper defaultOpen={true} />,
};
