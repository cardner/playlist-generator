import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card } from "./Card";

const meta: Meta<typeof Card> = {
  component: Card,
};

export default meta;

type Story = StoryObj<typeof Card>;

export const None: Story = {
  args: { padding: "none", children: "Content with no padding" },
};

export const Sm: Story = {
  args: { padding: "sm", children: "Content with small padding" },
};

export const Md: Story = {
  args: { padding: "md", children: "Content with medium padding" },
};

export const Lg: Story = {
  args: { padding: "lg", children: "Content with large padding" },
};
