import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/design-system/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./.storybook/preview.tsx",
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
        /* Tertiary accent purple – RGB with <alpha-value> so opacity modifiers work */
        "accent-tertiary": "rgb(171 71 188 / <alpha-value>)",
        "accent-tertiary-hover": "rgb(186 104 200 / <alpha-value>)",
        /* Info blue palette (base #4FB3EA) – RGB with <alpha-value> so opacity modifiers work */
        "info-blue": {
          50: "rgb(232 246 252 / <alpha-value>)",
          100: "rgb(197 233 248 / <alpha-value>)",
          200: "rgb(157 217 244 / <alpha-value>)",
          300: "rgb(111 196 239 / <alpha-value>)",
          400: "rgb(79 179 234 / <alpha-value>)",
          500: "rgb(58 159 214 / <alpha-value>)",
          600: "rgb(43 139 196 / <alpha-value>)",
        },
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
      },
      keyframes: {
        "icon-bounce": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
        "icon-pop": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.12)" },
        },
      },
      animation: {
        "icon-bounce": "icon-bounce 0.4s ease-out",
        "icon-pop": "icon-pop 0.35s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;

