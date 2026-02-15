import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Textarea } from "./Textarea";

const meta: Meta<typeof Textarea> = {
  component: Textarea,
};

export default meta;

type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {
    label: "Description",
    value: "",
    placeholder: "Enter description...",
  },
};

export const WithError: Story = {
  args: {
    label: "Description",
    value: "",
    error: "This field is required",
  },
};
