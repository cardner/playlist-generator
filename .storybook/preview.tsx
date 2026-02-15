import { Preview } from "@storybook/react";
import { useEffect } from "react";
import "../src/app/globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

// Ensure data-theme is set on document for CSS variables (ThemeProvider sets this
// in useEffect, but we need it before first paint to avoid flash of unstyled content)
if (typeof document !== "undefined") {
  const html = document.documentElement;
  if (!html.hasAttribute("data-theme")) {
    html.setAttribute("data-theme", "dark");
  }
}

const preview: Preview = {
  parameters: {
    nextjs: {
      appDirectory: true,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default preview;
