#!/usr/bin/env node
/**
 * Copy FFmpeg WASM assets from node_modules/@ffmpeg/core to public/ffmpeg/.
 * Run after: yarn add -D @ffmpeg/core@^0.12
 * See docs/ffmpeg-setup.md.
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const coreDir = path.join(root, "node_modules", "@ffmpeg", "core", "dist");
const outDir = path.join(root, "public", "ffmpeg");

const files = ["ffmpeg-core.js", "ffmpeg-core.wasm", "ffmpeg-core.worker.js"];

// Prefer UMD (single-thread); fall back to esm
const umdDir = path.join(coreDir, "umd");
const esmDir = path.join(coreDir, "esm");
const sourceDir = fs.existsSync(umdDir) ? umdDir : esmDir;

if (!fs.existsSync(sourceDir)) {
  console.warn(
    "@ffmpeg/core not found or missing dist. Install with: yarn add -D @ffmpeg/core@^0.12"
  );
  process.exit(1);
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

let copied = 0;
for (const name of files) {
  const src = path.join(sourceDir, name);
  const dest = path.join(outDir, name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${name}`);
    copied++;
  } else {
    console.warn(`Skip (not found): ${name}`);
  }
}

if (copied === 0) {
  console.warn("No files copied. Check that @ffmpeg/core has dist/umd or dist/esm.");
  process.exit(1);
}

console.log(`Done. ${copied} file(s) in public/ffmpeg/`);
