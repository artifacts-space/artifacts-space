import type { Implementation } from "@modelcontextprotocol/sdk/types.js";

import { siteOrigin } from "@/lib/site-origin";

/** The one-line description clients may show beside the server's name. */
export const SERVER_DESCRIPTION = "Save plans, specs, reports, and notes as artifacts people and agents read, comment on, share, and keep in version history.";

/**
 * What the MCP server says it is in `initialize` (`serverInfo`): its name,
 * a human title, the site, a short description, and icons clients may show.
 * The icons are files the site already serves: the 1254px PNG in public/ and
 * the SVG app icon (src/app/icon.svg). URLs use this site's own origin, so a
 * self-hosted copy points at itself.
 */
export function mcpServerInfo(env: NodeJS.ProcessEnv = process.env): Implementation {
  const origin = siteOrigin(env);
  return {
    name: "artifacts.space",
    title: "artifacts.space",
    version: "1.0.0",
    description: SERVER_DESCRIPTION,
    websiteUrl: origin,
    icons: [
      { src: `${origin}/artifacts-space-icon.png`, mimeType: "image/png", sizes: ["1254x1254"] },
      { src: `${origin}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
    ],
  };
}
