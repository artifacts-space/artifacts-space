import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { McpAccess } from "@/lib/oauth/scopes";
import { allowedThemeFonts, THEME_DOCS_PATH, themePresetSummaries } from "@/lib/themes/artifact-theme";

import { gateTools } from "./tool-access";

/** What themes_list returns: the presets, the fonts theme JSON may name, and how to use them. */
export function themesListResult() {
  return {
    presets: themePresetSummaries(),
    customFonts: allowedThemeFonts(),
    usage: `Set \`theme\` on artifacts_create or artifacts_update to a preset id, or to theme JSON (fonts by id from customFonts). Pass null to remove it. Rules and an example: ${THEME_DOCS_PATH}.`,
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
      description: "Lists the theme presets an artifact can use (id, name, description, mode, and fonts), plus the font ids custom theme JSON may use. Pass a preset id as `theme` on artifacts_create or artifacts_update.",
      inputSchema: {},
    },
    () => ({ content: [{ type: "text" as const, text: JSON.stringify(themesListResult(), null, 2) }] }),
  );
}
