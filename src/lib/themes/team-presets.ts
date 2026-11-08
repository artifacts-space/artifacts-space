import { randomUUID } from "node:crypto";

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, team, teamThemePreset, user } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { UserFacingError } from "@/lib/user-facing-error";

import { parseTheme, type Theme } from "./schema";
import { recordDefaultRevision, recordPresetRevision, revisionOf } from "./team-theme-revisions";
import {
  duplicatePresetName,
  hasRoomForPreset,
  newPresetSlug,
  parseTeamDefaultInput,
  parseTeamPresetInput,
  TEAM_PRESET_CAP_MESSAGE,
  teamPresetRef,
} from "./team-preset-rules";

/**
 * Team theme presets and the team default in the database. Callers check
 * that the person is an owner or admin of the team first (theme-actions.ts);
 * these functions only scope every query to the team. Nothing here files an
 * artifact version: presets and the default are team settings, and artifacts
 * refer to them live.
 */

/** A team preset as team settings and pickers show it. */
export interface TeamPresetDto {
  id: string;
  /** The reference artifacts store: "team:<slug>". */
  ref: string;
  name: string;
  description: string;
  theme: Theme;
  updatedAt: string;
}

/** A team's theme settings: its presets and default, with who set the default. */
export interface TeamThemeSettings {
  presets: TeamPresetDto[];
  defaultTheme: string | null;
  defaultSetBy: string | null;
  defaultSetAt: string | null;
}

type PresetRow = typeof teamThemePreset.$inferSelect;

function toDto(row: PresetRow): TeamPresetDto {
  return { id: row.id, ref: teamPresetRef(row.slug), name: row.name, description: row.description, theme: row.theme, updatedAt: row.updatedAt.toISOString() };
}

/** Every preset of these teams, oldest first, by team id. Callers pass only teams the viewer belongs to. */
export async function listPresetsForTeams(teamIds: readonly string[]): Promise<Map<string, TeamPresetDto[]>> {
  const byTeam = new Map<string, TeamPresetDto[]>();
  if (teamIds.length === 0) return byTeam;
  const rows = await getDb().select().from(teamThemePreset).where(inArray(teamThemePreset.teamId, [...teamIds])).orderBy(asc(teamThemePreset.createdAt));
  for (const row of rows) {
    const list = byTeam.get(row.teamId) ?? [];
    list.push(toDto(row));
    byTeam.set(row.teamId, list);
  }
  return byTeam;
}

/** The team's presets and default, for team settings. Callers check membership first. */
export async function loadTeamThemeSettings(teamId: string): Promise<TeamThemeSettings> {
  const [presets, [row]] = await Promise.all([
    listPresetsForTeams([teamId]),
    getDb()
      .select({ defaultTheme: team.defaultTheme, setAt: team.defaultThemeSetAt, setBy: user.name })
      .from(team)
      .leftJoin(user, eq(user.id, team.defaultThemeSetBy))
      .where(eq(team.id, teamId))
      .limit(1),
  ]);
  return {
    presets: presets.get(teamId) ?? [],
    defaultTheme: row?.defaultTheme ?? null,
    defaultSetBy: row?.setBy ?? null,
    defaultSetAt: row?.setAt?.toISOString() ?? null,
  };
}

async function presetCount(teamId: string): Promise<number> {
  const [row] = await getDb().select({ value: count() }).from(teamThemePreset).where(eq(teamThemePreset.teamId, teamId));
  return row?.value ?? 0;
}

/**
 * Writes a history revision after a save that already happened. A failed
 * history write is logged, never turned into a failed save.
 */
async function keepRevision(write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (error) {
    console.error("[themes] Revision not recorded", error instanceof Error ? error.name : "unknown error");
  }
}

function checkedPreset(input: unknown) {
  const parsed = parseTeamPresetInput(input);
  if (!parsed.ok) throw new UserFacingError(parsed.message);
  return parsed.value;
}

async function insertPreset(teamId: string, userId: string, value: { name: string; description: string; theme: Theme }): Promise<TeamPresetDto> {
  if (!hasRoomForPreset(await presetCount(teamId))) throw new UserFacingError(TEAM_PRESET_CAP_MESSAGE);
  // A random suffix makes a clash rare; one retry covers it.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const [row] = await getDb()
        .insert(teamThemePreset)
        .values({ id: randomUUID(), teamId, slug: newPresetSlug(value.name), ...value, createdBy: userId, updatedBy: userId })
        .returning();
      if (!row) continue;
      await keepRevision(() => recordPresetRevision(teamId, row, userId));
      return toDto(row);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt > 0) throw error;
    }
  }
  throw new Error("The preset could not be created.");
}

/** Creates a preset in the team, under the runaway cap. The theme must pass validation, contrast included. */
export async function createTeamPreset(teamId: string, userId: string, input: unknown): Promise<TeamPresetDto> {
  return insertPreset(teamId, userId, checkedPreset(input));
}

/** Changes a preset's name, description, and theme. Its id (and so every reference) stays the same. */
export async function updateTeamPreset(teamId: string, presetId: string, userId: string, input: unknown): Promise<TeamPresetDto> {
  const value = checkedPreset(input);
  const [row] = await getDb()
    .update(teamThemePreset)
    .set({ ...value, updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(teamThemePreset.id, presetId), eq(teamThemePreset.teamId, teamId)))
    .returning();
  if (!row) throw new UserFacingError("That preset is gone. Reload the page.");
  await keepRevision(() => recordPresetRevision(teamId, row, userId));
  return toDto(row);
}

async function presetInTeam(teamId: string, presetId: string): Promise<PresetRow> {
  const [row] = await getDb().select().from(teamThemePreset).where(and(eq(teamThemePreset.id, presetId), eq(teamThemePreset.teamId, teamId))).limit(1);
  if (!row) throw new UserFacingError("That preset is gone. Reload the page.");
  return row;
}

/** Copies a preset under a new id and the name "<name> copy". */
export async function duplicateTeamPreset(teamId: string, presetId: string, userId: string): Promise<TeamPresetDto> {
  const source = await presetInTeam(teamId, presetId);
  return insertPreset(teamId, userId, { name: duplicatePresetName(source.name), description: source.description, theme: source.theme });
}

/** How many artifacts name this preset as their own theme. */
export async function countArtifactsUsingPreset(teamId: string, presetId: string): Promise<{ artifacts: number; isDefault: boolean }> {
  const source = await presetInTeam(teamId, presetId);
  const ref = teamPresetRef(source.slug);
  const [[usage], [owner]] = await Promise.all([
    getDb().select({ value: count() }).from(artifact).where(sql`${artifact.theme} = to_jsonb(${ref}::text)`),
    getDb().select({ defaultTheme: team.defaultTheme }).from(team).where(eq(team.id, teamId)).limit(1),
  ]);
  return { artifacts: usage?.value ?? 0, isDefault: owner?.defaultTheme === ref };
}

/**
 * Deletes a preset. Artifacts that named it keep the reference and fall back
 * to the team default, then the site default; when it was the team default,
 * the team goes back to the site default.
 */
export async function deleteTeamPreset(teamId: string, presetId: string, userId: string): Promise<void> {
  const [row] = await getDb()
    .delete(teamThemePreset)
    .where(and(eq(teamThemePreset.id, presetId), eq(teamThemePreset.teamId, teamId)))
    .returning();
  if (!row) throw new UserFacingError("That preset is gone. Reload the page.");
  const ref = teamPresetRef(row.slug);
  const cleared = await getDb()
    .update(team)
    .set({ defaultTheme: null, defaultThemeSetBy: userId, defaultThemeSetAt: new Date() })
    .where(and(eq(team.id, teamId), eq(team.defaultTheme, ref)))
    .returning();
  if (cleared.length === 0) return;
  console.info("[themes] Team default cleared with its deleted preset", { teamId, by: userId, from: ref });
  await keepRevision(() => recordDefaultRevision(teamId, null, userId));
}

/**
 * Sets the team default: null (site default), a built-in preset id, or one of
 * the team's presets. Records who set it and when, and logs the change.
 */
export async function setTeamDefaultTheme(teamId: string, userId: string, input: unknown): Promise<string | null> {
  const presets = await listPresetsForTeams([teamId]);
  const refs = new Set((presets.get(teamId) ?? []).map((preset) => preset.ref));
  const parsed = parseTeamDefaultInput(input, refs);
  if (!parsed.ok) throw new UserFacingError(parsed.message);
  const [before] = await getDb().select({ defaultTheme: team.defaultTheme }).from(team).where(eq(team.id, teamId)).limit(1);
  await getDb().update(team).set({ defaultTheme: parsed.value, defaultThemeSetBy: userId, defaultThemeSetAt: new Date() }).where(eq(team.id, teamId));
  console.info("[themes] Team default theme changed", { teamId, by: userId, from: before?.defaultTheme ?? null, to: parsed.value });
  await keepRevision(() => recordDefaultRevision(teamId, parsed.value, userId));
  return parsed.value;
}

/** The message when an old revision fails today's checks: the editor shows it with suggestions instead. */
export const STALE_REVISION_MESSAGE = "That older theme does not pass today's checks. Open it in the editor, apply the suggested colors, and save.";

/**
 * Restores a preset revision's theme as a new save (and so a new revision);
 * the preset keeps its current name. The theme must pass today's checks,
 * contrast included; old revisions are never rewritten.
 */
export async function restorePresetRevision(teamId: string, presetId: string, revisionId: string, userId: string): Promise<TeamPresetDto> {
  const [revision, current] = await Promise.all([revisionOf({ kind: "preset", teamId, presetId }, revisionId), presetInTeam(teamId, presetId)]);
  if (!parseTheme(revision.theme).ok) throw new UserFacingError(STALE_REVISION_MESSAGE);
  return updateTeamPreset(teamId, presetId, userId, { name: current.name, description: current.description, theme: revision.theme });
}

/** Restores an earlier team default as a new change (and so a new revision). A preset that was deleted since is refused. */
export async function restoreDefaultRevision(teamId: string, revisionId: string, userId: string): Promise<string | null> {
  const revision = await revisionOf({ kind: "default", teamId }, revisionId);
  return setTeamDefaultTheme(teamId, userId, revision.defaultTheme);
}

/** Each team's default theme, by team id. Callers pass only teams the viewer belongs to. */
export async function teamDefaultsFor(teamIds: readonly string[]): Promise<Map<string, string | null>> {
  if (teamIds.length === 0) return new Map();
  const rows = await getDb().select({ id: team.id, defaultTheme: team.defaultTheme }).from(team).where(inArray(team.id, [...teamIds]));
  return new Map(rows.map((row) => [row.id, row.defaultTheme]));
}
