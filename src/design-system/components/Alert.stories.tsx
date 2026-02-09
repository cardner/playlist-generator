import { Meta, StoryObj } from "@storybook/react";
import { Alert } from "./Alert";

const meta: Meta<typeof Alert> = {
  component: Alert,
};

export default meta;

type Story = StoryObj<typeof Alert>;

export const Warning: Story = {
  args: {
    variant: "warning",
    title: "Conflict",
    children: "A collection with this name exists.",
  },
};

export const Error: Story = {
  args: {
    variant: "error",
    children: "Something went wrong.",
  },
};

export const Success: Story = {
  args: {
    variant: "success",
    children: "Import complete.",
  },
};

export const Info: Story = {
  args: {
    variant: "info",
    children: "Information message.",
  },
};

export const WithTitle: Story = {
  args: {
    variant: "warning",
    title: "Conflict",
    children: "A collection with this name exists.",
  },
};
