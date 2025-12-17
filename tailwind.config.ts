import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "app-bg": "var(--app-bg)",
        "app-primary": "var(--app-primary)",
        "app-secondary": "var(--app-secondary)",
        "app-tertiary": "var(--app-tertiary)",
        "app-surface": "var(--app-surface)",
        "app-surface-hover": "var(--app-surface-hover)",
        "app-border": "var(--app-border)",
        "app-hover": "var(--app-hover)",
        "accent-primary": "var(--accent-primary)",
        "accent-secondary": "var(--accent-secondary)",
        "accent-hover": "var(--accent-hover)",
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
      },
    },
  },
  plugins: [],
};
export default config;

