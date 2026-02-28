#!/usr/bin/env node

/**
 * Updates public/manifest.webmanifest with the version from package.json.
 * Used in CI so the PWA manifest version stays in sync with the app release.
 *
 * Usage: node scripts/update-manifest-version.js
 * (Reads version from package.json and writes to public/manifest.webmanifest)
 */

const fs = require("fs");
const path = require("path");

const packagePath = path.join(process.cwd(), "package.json");
const manifestPath = path.join(process.cwd(), "public", "manifest.webmanifest");

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const version = pkg.version;
if (!version) {
  console.error("No version in package.json");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.version = version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Updated manifest version to ${version}`);
