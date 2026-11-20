import type { NextConfig } from "next";

import { pageDomainRewrites } from "./src/lib/page-host/rules";
import { securityHeaderRules } from "./src/lib/security-header-rules";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  headers: () =>
    Promise.resolve([
      // Framing, sniffing, Referer, browser feature, and HTTPS headers on every response.
      ...securityHeaderRules(),
      // Vendored emoji data and theme fonts live under versioned paths, so they never change in place.
      { source: "/emoji/:version/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/fonts/:version/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // A sign-in page with a return address is one of many addresses for the same page, and an artifact a signed-out
      // visitor cannot read redirects to it (src/proxy.ts unreadableArtifact): search engines list none of them.
      ...["/sign-in", "/sign-up"].map((source) => ({ source, has: [{ type: "query" as const, key: "next" }], headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
      // The notifications service worker: always checked for updates, and it may load nothing from elsewhere.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Content-Security-Policy", value: "default-src 'self'; frame-ancestors 'none'" }] },
    ]),
  // Hosts under the page domain that are not page hosts get nothing of the app: checked before any file or page.
  rewrites: () => Promise.resolve({ beforeFiles: pageDomainRewrites(), afterFiles: [], fallback: [] }),
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
