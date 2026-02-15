import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  component: Input,
};

export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: {
    label: "Title",
    value: "",
    placeholder: "Enter title...",
  },
};

export const WithError: Story = {
  args: {
    label: "Title",
    value: "",
    error: "This field is required",
  },
};

export const WithPlaceholder: Story = {
  args: {
    label: "Description",
    value: "",
    placeholder: "Enter description...",
  },
};
