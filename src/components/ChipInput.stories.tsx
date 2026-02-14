import { Meta, StoryObj } from "@storybook/react";
import { ChipInput } from "./ChipInput";

const meta: Meta<typeof ChipInput> = {
  component: ChipInput,
};

export default meta;

type Story = StoryObj<typeof ChipInput>;

export const Empty: Story = {
  args: {
    values: [],
    onChange: () => {},
    placeholder: "Add genres...",
  },
};

export const WithChips: Story = {
  args: {
    values: ["Rock", "Jazz", "Electronic"],
    onChange: () => {},
    placeholder: "Add genres...",
  },
};

export const WithSuggestions: Story = {
  args: {
    values: ["Rock"],
    onChange: () => {},
    placeholder: "Add genres...",
    suggestions: ["Rock", "Jazz", "Electronic", "Classical", "Pop"],
  },
};

export const WithRelatedSuggestions: Story = {
  args: {
    values: ["Rock"],
    onChange: () => {},
    placeholder: "Add genres...",
    suggestions: ["Rock", "Jazz", "Electronic", "Classical", "Pop", "Indie Rock", "Alternative Rock", "Punk"],
    relatedSuggestions: ["Indie Rock", "Alternative Rock", "Punk", "Classic Rock"],
  },
};
