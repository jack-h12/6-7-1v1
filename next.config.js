const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root so Next.js 16 doesn't climb up and detect an unrelated
  // lockfile in the user's home directory.
  turbopack: {
    root: __dirname,
  },
  // Also pin the file-tracing root for `next build` output (kept in sync with turbopack.root).
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
