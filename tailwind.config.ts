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
          700: "rgb(30 107 158 / <alpha-value>)",
          800: "rgb(21 82 122 / <alpha-value>)",
        },
        /* Magenta palette (base #e91e63) – accent, errors, destructive */
        magenta: {
          50: "rgb(252 228 236 / <alpha-value>)",
          100: "rgb(248 187 208 / <alpha-value>)",
          200: "rgb(244 143 177 / <alpha-value>)",
          300: "rgb(240 98 146 / <alpha-value>)",
          400: "rgb(236 64 122 / <alpha-value>)",
          500: "rgb(233 30 99 / <alpha-value>)",
          600: "rgb(194 24 91 / <alpha-value>)",
          700: "rgb(160 20 80 / <alpha-value>)",
          800: "rgb(123 16 66 / <alpha-value>)",
        },
        /* Purple palette (base #ab47bc) – accent tertiary */
        purple: {
          50: "rgb(243 229 245 / <alpha-value>)",
          100: "rgb(225 190 231 / <alpha-value>)",
          200: "rgb(206 147 216 / <alpha-value>)",
          300: "rgb(186 104 200 / <alpha-value>)",
          400: "rgb(171 71 188 / <alpha-value>)",
          500: "rgb(156 39 176 / <alpha-value>)",
          600: "rgb(142 36 170 / <alpha-value>)",
          700: "rgb(123 31 162 / <alpha-value>)",
          800: "rgb(106 27 154 / <alpha-value>)",
        },
        /* Yellow palette (base #facc15) – warning, caution */
        yellow: {
          50: "rgb(254 252 232 / <alpha-value>)",
          100: "rgb(254 249 195 / <alpha-value>)",
          200: "rgb(254 240 138 / <alpha-value>)",
          300: "rgb(253 224 71 / <alpha-value>)",
          400: "rgb(250 204 21 / <alpha-value>)",
          500: "rgb(229 168 0 / <alpha-value>)",
          600: "rgb(202 154 0 / <alpha-value>)",
          700: "rgb(166 124 0 / <alpha-value>)",
          800: "rgb(133 98 0 / <alpha-value>)",
        },
        /* Green palette (base #34d399) – success, positive */
        green: {
          50: "rgb(236 253 245 / <alpha-value>)",
          100: "rgb(209 250 229 / <alpha-value>)",
          200: "rgb(167 243 208 / <alpha-value>)",
          300: "rgb(110 231 183 / <alpha-value>)",
          400: "rgb(52 211 153 / <alpha-value>)",
          500: "rgb(16 185 129 / <alpha-value>)",
          600: "rgb(5 150 105 / <alpha-value>)",
          700: "rgb(4 120 87 / <alpha-value>)",
          800: "rgb(6 95 70 / <alpha-value>)",
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

