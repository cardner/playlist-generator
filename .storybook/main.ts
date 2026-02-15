import type { StorybookConfig } from "@storybook/nextjs-vite";
import path from "path";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  staticDirs: ["../public"],
  async viteFinal(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(process.cwd(), "src"),
      "@/workers/tempo-detection-worker": path.resolve(
        process.cwd(),
        "src/lib/empty-module.ts"
      ),
      "next/navigation": path.resolve(
        process.cwd(),
        "src/__mocks__/next-navigation.ts"
      ),
    };
    return config;
  },
};

export default config;
