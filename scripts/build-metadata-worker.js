/**
 * Build metadata worker for browser
 * Bundles src/workers/metadataWorker.ts into public/metadataWorker.js
 * so music-metadata is included for offline PWA support.
 */

const esbuild = require("esbuild");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

esbuild
  .build({
    entryPoints: [path.join(projectRoot, "src/workers/metadataWorker.ts")],
    bundle: true,
    outfile: path.join(projectRoot, "public/metadataWorker.js"),
    format: "iife",
    platform: "browser",
    target: "es2020",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "path-alias",
        setup(build) {
          build.onResolve({ filter: /^@\// }, (args) => {
            const subpath = args.path.replace(/^@\//, "");
            const resolved = path.join(projectRoot, "src", subpath);
            return {
              path: resolved.endsWith(".ts") ? resolved : resolved + ".ts",
            };
          });
        },
      },
    ],
  })
  .then(() => {
    console.log("Metadata worker built successfully");
  })
  .catch((err) => {
    console.error("Failed to build metadata worker:", err);
    process.exit(1);
  });
