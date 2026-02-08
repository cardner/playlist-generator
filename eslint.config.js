const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "public/ffmpeg/**",
      "public/ipod/**",
      "public/metadataWorker.js",
      "node_modules/**",
      "coverage/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
];
