import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { teamThemeRevision, user } from "@/db/schema";
import { UserFacingError } from "@/lib/user-facing-error";

import type { Theme } from "./schema";
import { teamPresetLimits } from "./team-preset-limits";

/**
 * Restore history for team themes: one revision per save of a team preset
 * (its name and theme) and per change of the team default (its id), written
 * on every change and on every restore, never rewritten. Only the newest
 * `maxRevisions` of each preset and of each team default are kept (a
 * runaway cap). Callers check the person may manage the team's themes first
 * (theme-actions.ts); every query here is scoped to the team. Nothing here
 * files artifact versions.
 */

/** One revision as the history lists show it, newest first. */
export interface TeamThemeRevisionDto {
  id: string;
  createdAt: string;
  /** Who saved it, or null when that account is gone. */
  by: string | null;
  /** Preset revisions: the preset's name and theme then. */
  name: string | null;
  theme: Theme | null;
  /** Default revisions: the default then (a preset id), or null for the site default. */
  defaultTheme: string | null;
}

/** The revisions of one preset, or of the team default. */
type Subject = { kind: "preset"; teamId: string; presetId: string } | { kind: "default"; teamId: string };

function subjectWhere(subject: Subject): SQL | undefined {
  const scope = [eq(teamThemeRevision.teamId, subject.teamId), eq(teamThemeRevision.kind, subject.kind)];
  scope.push(subject.kind === "preset" ? eq(teamThemeRevision.presetId, subject.presetId) : isNull(teamThemeRevision.presetId));
  return and(...scope);
}

/** Deletes the revisions of `subject` past the runaway cap, oldest first. */
async function prune(subject: Subject): Promise<void> {
  const stale = await getDb()
    .select({ id: teamThemeRevision.id })
    .from(teamThemeRevision)
    .where(subjectWhere(subject))
    .orderBy(desc(teamThemeRevision.createdAt), desc(teamThemeRevision.id))
    .offset(teamPresetLimits.maxRevisions);
  if (stale.length === 0) return;
  await getDb().delete(teamThemeRevision).where(inArray(teamThemeRevision.id, stale.map((row) => row.id)));
}

/** Records a preset's state after a save (create, edit, duplicate, restore), then prunes past the cap. */
export async function recordPresetRevision(teamId: string, preset: { id: string; name: string; theme: Theme }, userId: string): Promise<void> {
  await getDb().insert(teamThemeRevision).values({ id: randomUUID(), teamId, kind: "preset", presetId: preset.id, name: preset.name, theme: preset.theme, createdBy: userId });
  await prune({ kind: "preset", teamId, presetId: preset.id });
}

/** Records the team default after a change (or a restore), then prunes past the cap. */
export async function recordDefaultRevision(teamId: string, defaultTheme: string | null, userId: string): Promise<void> {
  await getDb().insert(teamThemeRevision).values({ id: randomUUID(), teamId, kind: "default", defaultTheme, createdBy: userId });
  await prune({ kind: "default", teamId });
}

async function listRevisions(subject: Subject): Promise<TeamThemeRevisionDto[]> {
  const rows = await getDb()
    .select({ id: teamThemeRevision.id, createdAt: teamThemeRevision.createdAt, by: user.name, name: teamThemeRevision.name, theme: teamThemeRevision.theme, defaultTheme: teamThemeRevision.defaultTheme })
    .from(teamThemeRevision)
    .leftJoin(user, eq(user.id, teamThemeRevision.createdBy))
    .where(subjectWhere(subject))
    .orderBy(desc(teamThemeRevision.createdAt), desc(teamThemeRevision.id))
    .limit(teamPresetLimits.maxRevisions);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), by: row.by ?? null }));
}

/** A preset's revisions, newest first. */
export async function listPresetRevisions(teamId: string, presetId: string): Promise<TeamThemeRevisionDto[]> {
  return listRevisions({ kind: "preset", teamId, presetId });
}

/** The team default's revisions, newest first. */
export async function listDefaultRevisions(teamId: string): Promise<TeamThemeRevisionDto[]> {
  return listRevisions({ kind: "default", teamId });
}

/** One revision of `subject`, or a refusal when it is not this team's (or this preset's) or has been pruned. */
export async function revisionOf(subject: Subject, revisionId: string): Promise<TeamThemeRevisionDto> {
  const [row] = await getDb()
    .select({ id: teamThemeRevision.id, createdAt: teamThemeRevision.createdAt, name: teamThemeRevision.name, theme: teamThemeRevision.theme, defaultTheme: teamThemeRevision.defaultTheme })
    .from(teamThemeRevision)
    .where(and(subjectWhere(subject), eq(teamThemeRevision.id, revisionId)))
    .limit(1);
  if (!row) throw new UserFacingError("That revision is no longer in the history. Reload the page.");
  return { ...row, createdAt: row.createdAt.toISOString(), by: null };
}
