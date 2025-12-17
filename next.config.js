/** @type {import('next').NextConfig} */
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
  // Exclude Figma reference files from compilation
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/Playlist Creation Website/**'],
    };
    return config;
  },
}

module.exports = nextConfig

