import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { COVER_DOCS_PATH, coverGradientSummaries } from "@/lib/covers/cover";
import type { McpAccess } from "@/lib/oauth/scopes";
import { allowedThemeFonts, THEME_DOCS_PATH, themePresetSummaries } from "@/lib/themes/artifact-theme";

import { gateTools } from "./tool-access";

/** What themes_list returns: the presets, the fonts theme JSON may name, the cover gradients, and how to use them. */
export function themesListResult() {
  return {
    presets: themePresetSummaries(),
    customFonts: allowedThemeFonts(),
    usage: `Set \`theme\` on artifacts_create or artifacts_update to a preset id, or to theme JSON (fonts by id from customFonts). Pass null to remove it. Rules and an example: ${THEME_DOCS_PATH}.`,
    covers: {
      gradients: coverGradientSummaries(),
      usage: `Set \`cover\` on artifacts_create or artifacts_update to a gradient id (it follows the theme and light or dark mode), or to "file:<file id>" for an uploaded PNG, JPEG, GIF, WebP, or AVIF of at most 2 MB, with an optional \`coverPosition\` (0 top to 100 bottom). Pass null to remove it. More: ${COVER_DOCS_PATH}.`,
    },
  };
}

/**
 * Registers themes_list, a read tool: the built-in theme presets with their
 * fonts. Agents set themes only on artifacts they can edit (artifacts_create
 * and artifacts_update); there is no tool to create or change presets.
 */
export function registerThemeTools(server: McpServer, access: McpAccess) {
  const gated = gateTools(server, access);
  gated.registerTool(
    "themes_list",
    {
      title: "List themes",
      description: "Lists the theme presets an artifact can use (id, name, description, mode, and fonts), the font ids custom theme JSON may use, and the cover gradients. Pass a preset id as `theme`, and a gradient id as `cover`, on artifacts_create or artifacts_update.",
      inputSchema: {},
    },
    () => ({ content: [{ type: "text" as const, text: JSON.stringify(themesListResult(), null, 2) }] }),
  );
}
