/** @type {import('next').NextConfig} */
const path = require("path");
const nextConfig = {
  reactStrictMode: true,
  // Enable static export for GitHub Pages
  output: 'export',
  // Root path deployment (empty basePath for root domain)
  basePath: '',
  assetPrefix: '',
  // GitHub Pages doesn't support Next.js Image Optimization
  images: {
    unoptimized: true,
  },
  // Clean URLs without trailing slashes
  trailingSlash: false,
  // Skip type checking during build (can speed up builds)
  typescript: {
    ignoreBuildErrors: false,
  },
  // Turbopack configuration (matches webpack alias behavior)
  turbopack: {
    resolveAlias: {
      "@/workers/tempo-detection-worker": path.join(
        __dirname,
        "src/lib/empty-module.ts"
      ),
    },
  },
  // Exclude Figma reference files from compilation
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/Playlist Creation Website/**', '**/workers/tempo-detection-worker.ts'],
    };
    
    // Exclude tempo detection worker from being processed
    // It's only used as a standalone file in public folder
    config.resolve.alias = {
      ...config.resolve.alias,
      '@/workers/tempo-detection-worker': false,
    };
    
    return config;
  },
}

module.exports = nextConfig

