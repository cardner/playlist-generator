/**
 * Build metadata worker for browser
 * Bundles src/workers/metadataWorker.ts into public/metadataWorker.js
 * so music-metadata is included for offline PWA support.
 */

const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

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
            let resolved = path.join(projectRoot, "src", subpath);
            
            // If path already has .ts extension, use it as-is
            if (resolved.endsWith(".ts")) {
              return { path: resolved };
            }
            
            // Check if the resolved path is a directory
            try {
              const stats = fs.statSync(resolved);
              if (stats.isDirectory()) {
                // For directories, try index.ts
                resolved = path.join(resolved, "index.ts");
              } else {
                // It's a file, add .ts extension
                resolved = resolved + ".ts";
              }
            } catch {
              // Path doesn't exist yet, assume it needs .ts extension
              resolved = resolved + ".ts";
            }
            
            return { path: resolved };
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
