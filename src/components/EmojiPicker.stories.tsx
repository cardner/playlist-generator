import { useState } from "react";
import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EmojiPicker } from "./EmojiPicker";

const meta: Meta<typeof EmojiPicker> = {
  component: EmojiPicker,
  tags: ["no-screenshot"],
};

export default meta;

type Story = StoryObj<typeof EmojiPicker>;

function EmojiPickerWrapper() {
  const [value, setValue] = useState<string | null>(null);
  return <EmojiPicker value={value} onChange={setValue} />;
}

export const Empty: Story = {
  render: () => <EmojiPickerWrapper />,
};
