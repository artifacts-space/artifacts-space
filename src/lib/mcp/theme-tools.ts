import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { COVER_DOCS_PATH, coverGradientSummaries } from "@/lib/covers/cover";
import type { McpAccess } from "@/lib/oauth/scopes";
import { listTeamsForUser } from "@/lib/teams/queries";
import { allowedThemeFonts, THEME_DOCS_PATH, themeFontsSummary, themePresetSummaries, type ThemePresetSummary } from "@/lib/themes/artifact-theme";
import { builtInPresets } from "@/lib/themes/resolve";
import { listPresetsForTeams, teamDefaultsFor, type TeamPresetDto } from "@/lib/themes/team-presets";

import { gateTools } from "./tool-access";

/** One team's presets and default, as themes_list returns them. */
export interface TeamThemes {
  team: string;
  name: string;
  /** The theme the team's artifacts use when they have none of their own, or null for the site default. */
  default: { id: string; name: string } | null;
  presets: ThemePresetSummary[];
}

function presetSummary(preset: TeamPresetDto): ThemePresetSummary {
  return { id: preset.ref, name: preset.name, description: preset.description, mode: preset.theme.mode, fonts: themeFontsSummary(preset.theme) };
}

function defaultEntry(id: string | null | undefined, presets: readonly TeamPresetDto[]): TeamThemes["default"] {
  if (!id) return null;
  const name = builtInPresets().get(id)?.name ?? presets.find((preset) => preset.ref === id)?.name;
  return name ? { id, name } : null;
}

/** The presets and default of each shared team the caller belongs to; never another team's. */
async function teamThemesFor(userId: string): Promise<TeamThemes[]> {
  const teams = (await listTeamsForUser(userId)).filter((team) => !team.personal);
  const ids = teams.map((team) => team.id);
  const [presets, defaults] = await Promise.all([listPresetsForTeams(ids), teamDefaultsFor(ids)]);
  return teams.map((team) => {
    const list = presets.get(team.id) ?? [];
    return { team: team.slug, name: team.name, default: defaultEntry(defaults.get(team.id), list), presets: list.map(presetSummary) };
  });
}

/** What themes_list returns for these teams: the built-in presets, the team presets and defaults, the fonts theme JSON may name, the cover gradients, and how to use them. */
export function buildThemesList(teams: TeamThemes[]) {
  return {
    presets: themePresetSummaries(),
    teams,
    customFonts: allowedThemeFonts(),
    usage: `Set \`theme\` on artifacts_create or artifacts_update to a preset id, or to theme JSON (fonts by id from customFonts). A team preset id ("team:…") works on artifacts shared through that team, and on your private artifacts when you belong to the team. An artifact with no theme uses its team's default, then the site default. Pass null to remove it. Team presets and defaults are set by team owners and admins in team settings, never over MCP. Rules and an example: ${THEME_DOCS_PATH}.`,
    covers: {
      gradients: coverGradientSummaries(),
      usage: `Set \`cover\` on artifacts_create or artifacts_update to a gradient id (it follows the theme and light or dark mode), or to "file:<file id>" for an uploaded PNG, JPEG, GIF, WebP, or AVIF of at most 2 MB, with an optional \`coverPosition\` (0 top to 100 bottom). Pass null to remove it. More: ${COVER_DOCS_PATH}.`,
    },
  };
}

/** themes_list for one caller: only the shared teams they belong to. */
export async function themesListResult(userId: string) {
  return buildThemesList(await teamThemesFor(userId));
}

/**
 * Registers themes_list, a read tool: the built-in theme presets, plus the
 * presets and default of each team the caller belongs to. Agents set themes
 * only on artifacts they can edit (artifacts_create and artifacts_update);
 * there is no tool to create or change presets or a team default.
 */
export function registerThemeTools(server: McpServer, userId: string, access: McpAccess) {
  const gated = gateTools(server, access);
  gated.registerTool(
    "themes_list",
    {
      title: "List themes",
      description:
        "Lists the theme presets an artifact can use: the built-ins, and the presets of each team you belong to with that team's default (id, name, description, mode, and fonts). Also the font ids custom theme JSON may use, and the cover gradients. Pass a preset id as `theme`, and a gradient id as `cover`, on artifacts_create or artifacts_update.",
      inputSchema: {},
    },
    async () => {
      try {
        return { content: [{ type: "text" as const, text: JSON.stringify(await themesListResult(userId), null, 2) }] };
      } catch (error) {
        console.error("[mcp] themes_list failed", error instanceof Error ? error.name : "unknown error");
        throw new Error("The themes could not be listed. Try again.");
      }
    },
  );
}
