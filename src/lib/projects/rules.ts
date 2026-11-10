import { z } from "zod";

import { normalizeIconInput, parseArtifactIcon } from "@/lib/artifact-icons";
import type { ArtifactVisibility } from "@/lib/artifact-types";

import { projectLimits } from "./limits";

/**
 * Projects group artifacts. Each project belongs to exactly one scope, and
 * an artifact's project always lives in the artifact's home scope:
 * - the team it is shared through, when that is a shared (not personal)
 *   team and the artifact is not private: everyone in the team can edit it,
 *   so the team shares one list of projects;
 * - otherwise its author: only the author can edit it, so the project list
 *   is the author's alone, and nobody else ever sees it.
 * This is the same line canEditArtifact draws (src/lib/access-rules.ts).
 */
export type ProjectScope = { kind: "user"; userId: string } | { kind: "team"; teamId: string };

/** A project filter on a list: one name key, or artifacts with no project. */
export type ProjectFilter = { key: string } | { none: true };

/** The fields of an artifact that decide its home scope. */
export interface HomeScopeSubject {
  userId: string;
  visibility: ArtifactVisibility;
  teamId: string | null;
}

/** The scope whose projects an artifact uses. `teamPersonal` is null when the artifact names no team. */
export function artifactHomeScope(subject: HomeScopeSubject, teamPersonal: boolean | null): ProjectScope {
  if (subject.visibility !== "private" && subject.teamId !== null && teamPersonal === false) return { kind: "team", teamId: subject.teamId };
  return { kind: "user", userId: subject.userId };
}

/** True when both scopes are the same person's or the same team's. */
export function sameScope(a: ProjectScope, b: ProjectScope): boolean {
  if (a.kind === "user" && b.kind === "user") return a.userId === b.userId;
  if (a.kind === "team" && b.kind === "team") return a.teamId === b.teamId;
  return false;
}

/** A stored project's scope columns: exactly one is set. Null when the row is malformed. */
export function scopeOfRow(row: { userId: string | null; teamId: string | null }): ProjectScope | null {
  if (row.teamId && !row.userId) return { kind: "team", teamId: row.teamId };
  if (row.userId && !row.teamId) return { kind: "user", userId: row.userId };
  return null;
}

const spaces = /\s+/g;
// Control and format characters (zero-width spaces, direction overrides) never belong in a name.
const invisible = /[\p{Cc}\p{Cf}]/gu;

/** A project name as stored: NFC, no control characters, trimmed, inner spaces collapsed. "" when nothing is left. */
export function normalizeProjectName(value: string): string {
  return value.normalize("NFC").replace(invisible, "").replace(spaces, " ").trim();
}

/** The key two names share when they are the same project: the normalized name in lowercase. */
export function projectNameKey(name: string): string {
  return normalizeProjectName(name).toLocaleLowerCase("en-US");
}

const NAME_MESSAGE = `Project names are 1 to ${String(projectLimits.maxNameChars)} characters.`;

/** A project name at a boundary: normalized, then 1 to maxNameChars characters. */
export const projectNameSchema = z
  .string()
  .max(projectLimits.maxNameChars * 2, NAME_MESSAGE)
  .transform(normalizeProjectName)
  .pipe(z.string().min(1, NAME_MESSAGE).max(projectLimits.maxNameChars, NAME_MESSAGE));

/**
 * A project chosen by name, as agents and the blank page New artifact opens send it:
 * a name, or "" / null for no project. Outputs the normalized name or null.
 */
export const projectChoiceSchema = z
  .union([z.string().max(projectLimits.maxNameChars * 2, NAME_MESSAGE), z.null()])
  .transform((value) => (value === null ? "" : normalizeProjectName(value)))
  .pipe(z.string().max(projectLimits.maxNameChars, NAME_MESSAGE))
  .transform((name) => (name === "" ? null : name));

export const PROJECT_ICON_MESSAGE = 'Use one emoji (such as "🚀") or "tabler:<name>" from the allowed list (such as "tabler:rocket"). Send null or "" to remove the icon.';

/**
 * The stored form of a project icon: one emoji or an allowed "tabler:<name>",
 * null to remove it, or undefined when it is not allowed. Uploaded images
 * belong to one artifact, so projects cannot use them.
 */
export function normalizeProjectIcon(value: string | null): string | null | undefined {
  const normalized = normalizeIconInput(value);
  if (normalized === null || normalized === undefined) return normalized;
  return parseArtifactIcon(normalized)?.type === "file" ? undefined : normalized;
}

/** A project icon at a boundary. Outputs the stored form or null. */
export const projectIconSchema = z.union([z.string().max(64, PROJECT_ICON_MESSAGE), z.null()]).transform((value, context) => {
  const normalized = normalizeProjectIcon(value);
  if (normalized !== undefined) return normalized;
  context.addIssue({ code: "custom", message: PROJECT_ICON_MESSAGE });
  return z.NEVER;
});

/** True when a scope already holds as many projects as it may. */
export function scopeIsFull(count: number): boolean {
  return count >= projectLimits.maxPerScope;
}

/** One project in a filter: projects with the same name key are one entry. */
export interface ProjectFacetSource {
  id: string;
  name: string;
  nameKey: string;
  icon: string | null;
  /** True for the viewer's own projects, which win the name and icon when a key repeats. */
  own: boolean;
  count: number;
}

/** A filter entry: one name key, its shown name and icon, and how many artifacts it holds. */
export interface ProjectFacet {
  key: string;
  name: string;
  icon: string | null;
  count: number;
}

/**
 * Merges per-project counts into filter entries by name key, sorted by
 * name. The viewer's own project names the entry when a team project shares
 * its key. Empty projects are left out.
 */
export function mergeProjectFacets(sources: readonly ProjectFacetSource[]): ProjectFacet[] {
  const byKey = new Map<string, ProjectFacet & { own: boolean }>();
  for (const source of sources) {
    if (source.count <= 0) continue;
    const current = byKey.get(source.nameKey);
    if (!current) {
      byKey.set(source.nameKey, { key: source.nameKey, name: source.name, icon: source.icon, count: source.count, own: source.own });
      continue;
    }
    current.count += source.count;
    if (source.own && !current.own) Object.assign(current, { name: source.name, icon: source.icon, own: true });
  }
  return [...byKey.values()]
    .map(({ key, name, icon, count }) => ({ key, name, icon, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}
