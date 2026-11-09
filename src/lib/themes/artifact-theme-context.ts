import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { team, teamMember, teamThemePreset } from "@/db/schema";
import { loadTeamBasics } from "@/lib/teams/team-basics";

import {
  allowedPresetTeamIds,
  emptyThemeContext,
  resolveArtifactTheme,
  teamPresetSlug,
  themeTeamId,
  usableTeamPresets,
  type ArtifactThemeContext,
  type NamedResolvedTheme,
} from "./team-preset-rules";

/**
 * Loads what an artifact's theme resolves against: its theme team's default
 * and the team presets it may use (team-preset-rules.ts). The same for every
 * reader, signed in or not, because it is how the artifact looks; it never
 * lists a team's presets, only loads the ones the artifact names.
 */

/** The artifact fields theme resolution reads. */
export interface ThemeSubject {
  /** The author. */
  userId: string;
  visibility: string;
  teamId: string | null;
}

async function loadThemeTeam(subject: ThemeSubject): Promise<{ teamId: string | null; teamDefault: string | null }> {
  if (subject.visibility === "private" || subject.teamId === null) return { teamId: null, teamDefault: null };
  const row = await loadTeamBasics(subject.teamId);
  const teamId = themeTeamId(subject, row?.personal ?? null);
  return { teamId, teamDefault: teamId ? row?.defaultTheme ?? null : null };
}

/** The shared (not personal) teams a user belongs to. */
export async function sharedTeamIdsOf(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ teamId: teamMember.teamId })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(and(eq(teamMember.userId, userId), eq(team.personal, false)));
  return rows.map((row) => row.teamId);
}

/**
 * The context for resolving `themes` (the artifact's own theme, and the
 * themes of any versions shown) of one artifact.
 */
export async function loadArtifactThemeContext(subject: ThemeSubject, themes: readonly unknown[]): Promise<ArtifactThemeContext> {
  const themeTeam = await loadThemeTeam(subject);
  const slugs = [...new Set([...themes, themeTeam.teamDefault].flatMap((value) => teamPresetSlug(value) ?? []))];
  if (slugs.length === 0) return { ...emptyThemeContext, teamDefault: themeTeam.teamDefault };
  const allowed = allowedPresetTeamIds(themeTeam.teamId, themeTeam.teamId ? [] : await sharedTeamIdsOf(subject.userId));
  if (allowed.size === 0) return { ...emptyThemeContext, teamDefault: themeTeam.teamDefault };
  const rows = await getDb()
    .select({ slug: teamThemePreset.slug, teamId: teamThemePreset.teamId, name: teamThemePreset.name, theme: teamThemePreset.theme })
    .from(teamThemePreset)
    .where(and(inArray(teamThemePreset.slug, slugs), inArray(teamThemePreset.teamId, [...allowed])));
  return { teamDefault: themeTeam.teamDefault, presets: usableTeamPresets(rows, allowed) };
}

/**
 * Resolves the theme `theme` of this artifact renders with, falling back to
 * the site default if loading the team context fails, so a page never breaks
 * over its theme.
 */
export async function resolveThemeFor(subject: ThemeSubject, theme: unknown): Promise<NamedResolvedTheme> {
  const context = await loadArtifactThemeContext(subject, [theme]).catch((error: unknown) => {
    console.error("[themes] Team theme context failed", error instanceof Error ? error.name : "unknown error");
    return emptyThemeContext;
  });
  return resolveArtifactTheme(theme, context);
}
