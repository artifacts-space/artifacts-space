import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Vendored emoji data lives under a versioned path, so it never changes in place.
  headers: () =>
    Promise.resolve([{ source: "/emoji/:version/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }]),
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
