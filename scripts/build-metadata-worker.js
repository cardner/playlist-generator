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
            const basePath = path.join(projectRoot, "src", subpath);
            
            // If path already has .ts extension, use it as-is
            if (basePath.endsWith(".ts")) {
              return { path: basePath };
            }
            
            // Check if it's a file with .ts extension first
            const filePathWithTs = basePath + ".ts";
            if (fs.existsSync(filePathWithTs)) {
              return { path: filePathWithTs };
            }
            
            // Check if the base path is a directory
            try {
              const stats = fs.statSync(basePath);
              if (stats.isDirectory()) {
                // For directories, use index.ts if it exists
                const indexTsPath = path.join(basePath, "index.ts");
                if (fs.existsSync(indexTsPath)) {
                  return { path: indexTsPath };
                }
              }
            } catch {
              // Path doesn't exist, fall through to default
            }
            
            // Default: assume it needs .ts extension
            return { path: filePathWithTs };
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
