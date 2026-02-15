import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { WhatsNewPanel } from "./WhatsNewPanel";

const SAMPLE_CHANGELOG = `
## [1.2.0] - 2026-02-10

### Added
- Suggested genres while generating playlists
- Better file name outputs for playlists

### Fixed
- Missing screenshot test

## [1.1.0] - 2026-02-09

### Added
- Prompt queues for built-in agents
- Additional prompt for LLM generation

## [1.0.0] - 2026-02-08

### Added
- Improve mapping of moods and activities to metadata

## [0.9.0] - 2026-02-07

### Fixed
- Track matching between device and collections
- Fuzzy search lookup
`;

const meta: Meta<typeof WhatsNewPanel> = {
  component: WhatsNewPanel,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof WhatsNewPanel>;

export const Default: Story = {
  args: {
    markdown: SAMPLE_CHANGELOG,
  },
};

export const PanelOpenByDefault: Story = {
  args: {
    markdown: SAMPLE_CHANGELOG,
  },
  decorators: [
    (Story) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("whats-new-panel-open", "true");
      }
      return <Story />;
    },
  ],
};

const MANY_RELEASES = [
  "[1.5.0] - 2026-02-15",
  "[1.4.0] - 2026-02-14",
  "[1.3.0] - 2026-02-13",
  "[1.2.0] - 2026-02-12",
  "[1.1.0] - 2026-02-11",
  "[1.0.0] - 2026-02-10",
  "[0.9.0] - 2026-02-09",
  "[0.8.0] - 2026-02-08",
]
  .map(
    (h) => `
## ${h}

### Added
- New features in this release

### Fixed
- Bug fixes
`
  )
  .join("\n");

export const ManyReleases: Story = {
  args: {
    markdown: MANY_RELEASES,
  },
};
