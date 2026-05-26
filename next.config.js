/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export so Electron can load file:// pages
  output: 'export',
  // Disable image optimization (not supported in static export)
  images: { unoptimized: true },
  // Ensure assets use relative paths for Electron file:// protocol
  assetPrefix: process.env.NODE_ENV === 'production' ? '.' : '',
  trailingSlash: true,
};

module.exports = nextConfig;
