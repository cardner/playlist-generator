import { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Tabs } from "./Tabs";
import { Music, Sparkles } from "lucide-react";

function TabsWrapper({ initialValue = "library" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return (
    <Tabs
      value={value}
      onValueChange={setValue}
      items={[
        { value: "library", label: "From Library", icon: <Music className="size-4" /> },
        { value: "discovery", label: "Discover", icon: <Sparkles className="size-4" /> },
      ]}
    />
  );
}

const meta: Meta<typeof Tabs> = {
  component: Tabs,
};

export default meta;

type Story = StoryObj<typeof Tabs>;

export const TwoTabs: Story = {
  render: () => <TabsWrapper initialValue="library" />,
};

export const WithIcons: Story = {
  render: () => <TabsWrapper initialValue="discovery" />,
};
