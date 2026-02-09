import { Meta, StoryObj } from "@storybook/react";
import { Navigation } from "./Navigation";

const meta: Meta<typeof Navigation> = {
  component: Navigation,
};

export default meta;

type Story = StoryObj<typeof Navigation>;

export const Default: Story = {};
