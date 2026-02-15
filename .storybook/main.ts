import type { StorybookConfig } from "@storybook/react-webpack5";
import path from "path";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
    {
      name: "@storybook/addon-styling-webpack",
      options: {
        rules: [
          {
            test: /\.css$/,
            use: [
              "style-loader",
              { loader: "css-loader", options: { importLoaders: 1 } },
              {
                loader: "postcss-loader",
                options: {
                  postcssOptions: {
                    config: path.resolve(process.cwd(), "postcss.config.js"),
                  },
                },
              },
            ],
          },
        ],
      },
    },
  ],
  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },
  staticDirs: ["../public"],
  webpackFinal: async (config) => {
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
    // Prepend babel-loader for .ts/.tsx so TypeScript is transpiled before other loaders
    config.module = config.module ?? {};
    config.module.rules = config.module.rules ?? [];
    const babelRule = {
      test: /\.(tsx?|jsx?)$/,
      exclude: /node_modules/,
      use: [
        {
          loader: "babel-loader",
          options: {
            presets: [
              "@babel/preset-env",
              ["@babel/preset-react", { runtime: "automatic" }],
              "@babel/preset-typescript",
            ],
          },
        },
      ],
    };
    config.module.rules.unshift(babelRule);
    return config;
  },
};

export default config;
