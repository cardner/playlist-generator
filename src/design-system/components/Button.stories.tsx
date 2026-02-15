import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./Button";
import { X } from "lucide-react";

const meta: Meta<typeof Button> = {
  component: Button,
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: "primary", children: "Save" },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Cancel" },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "Skip" },
};

export const Danger: Story = {
  args: { variant: "danger", children: "Delete" },
};

export const WithLeftIcon: Story = {
  args: {
    variant: "secondary",
    leftIcon: <X className="size-4" />,
    children: "Close",
  },
};

export const WithRightIcon: Story = {
  args: {
    variant: "primary",
    rightIcon: <X className="size-4" />,
    children: "Add",
  },
};

export const Disabled: Story = {
  args: { variant: "primary", children: "Disabled", disabled: true },
};

export const SmSize: Story = {
  args: { variant: "secondary", size: "sm", children: "Small" },
};
