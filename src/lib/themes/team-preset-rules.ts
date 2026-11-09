import { z } from "zod";

import { can, type TeamActor } from "@/lib/teams/capability-rules";

import { artifactThemeLimits } from "./artifact-theme-limits";
import { builtInPresets, resolveTheme, type ResolvedTheme } from "./resolve";
import { parseTheme, type Theme, type ThemeIssue } from "./schema";
import { teamPresetLimits } from "./team-preset-limits";

/**
 * Team theme presets: the rules, with no database. A team preset is a theme
 * a team's owners and admins keep in team settings. Artifacts and the team
 * default refer to it by a stable id, "team:<slug>", never by a copy, so an
 * edit to the preset changes every artifact that uses it (a live reference;
 * versions store the reference too). The slug is random-suffixed, unique
 * across every team, and never changes, even when the preset is renamed.
 *
 * Which presets an artifact may use (and render with):
 * - an artifact shared through a team (team, link, or public in a shared
 *   team) uses that team's presets and that team's default;
 * - any other artifact (private, or approved through a personal team) has no
 *   team default, and may use presets of the shared teams its author belongs to.
 * A reference that is not allowed, or whose preset was deleted, is skipped,
 * so the artifact falls back to the team default, then the site default.
 */

export const TEAM_PRESET_PREFIX = "team:";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True for a string shaped like a team preset id ("team:<slug>"). It may still name no preset. */
export function isTeamPresetRef(value: unknown): value is `team:${string}` {
  if (typeof value !== "string" || !value.startsWith(TEAM_PRESET_PREFIX)) return false;
  const slug = value.slice(TEAM_PRESET_PREFIX.length);
  return slug.length > 0 && slug.length <= teamPresetLimits.maxSlugChars && slugPattern.test(slug);
}

/** The id artifacts store for a team preset. */
export function teamPresetRef(slug: string): string {
  return `${TEAM_PRESET_PREFIX}${slug}`;
}

/** The slug inside a team preset id, or null when the value is not one. */
export function teamPresetSlug(value: unknown): string | null {
  return isTeamPresetRef(value) ? value.slice(TEAM_PRESET_PREFIX.length) : null;
}

const NAME_PART_CHARS = 40;
const SUFFIX_CHARS = 6;
const suffixAlphabet = "abcdefghijkmnpqrstuvwxyz23456789";

/** A lowercase, dash-separated version of a preset name, at most 40 characters; "preset" when nothing is left. */
export function slugifyPresetName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAME_PART_CHARS)
    .replace(/-+$/g, "");
  return base === "" ? "preset" : base;
}

/**
 * A new slug for a preset: the name part and a random suffix, so two teams
 * that both make a "Brand" preset never share an id. `random` returns values
 * in [0, 1) and is injectable for tests.
 */
export function newPresetSlug(name: string, random: () => number = Math.random): string {
  const suffix = Array.from({ length: SUFFIX_CHARS }, () => suffixAlphabet[Math.floor(random() * suffixAlphabet.length)] ?? "a").join("");
  return `${slugifyPresetName(name)}-${suffix}`;
}

/** The artifact fields that decide its theme team. */
export interface ThemeTeamSubject {
  visibility: string;
  teamId: string | null;
}

/**
 * The team whose default and presets an artifact uses: the shared team it is
 * shared through, or null for private artifacts and those in a personal team.
 * `teamPersonal` is whether `teamId` is a personal team (null when unknown).
 */
export function themeTeamId(subject: ThemeTeamSubject, teamPersonal: boolean | null): string | null {
  if (subject.visibility === "private" || subject.teamId === null || teamPersonal !== false) return null;
  return subject.teamId;
}

/**
 * The teams whose presets an artifact may use: its theme team alone, or,
 * without one, the shared teams of its author.
 */
export function allowedPresetTeamIds(themeTeam: string | null, authorTeamIds: Iterable<string>): Set<string> {
  return themeTeam ? new Set([themeTeam]) : new Set(authorTeamIds);
}

/** One team preset as the resolver needs it. */
export interface StoredTeamPreset {
  slug: string;
  teamId: string;
  name: string;
  theme: unknown;
}

/** A usable team preset, validated, by reference. */
export interface UsableTeamPreset {
  ref: string;
  teamId: string;
  name: string;
  theme: Theme;
}

/**
 * The team presets an artifact may render with, by reference: only those of
 * allowed teams, and only those whose stored theme still validates.
 */
export function usableTeamPresets(presets: readonly StoredTeamPreset[], allowedTeams: ReadonlySet<string>): Map<string, UsableTeamPreset> {
  const usable = new Map<string, UsableTeamPreset>();
  for (const preset of presets) {
    if (!allowedTeams.has(preset.teamId)) continue;
    const parsed = parseTheme(preset.theme);
    if (!parsed.ok) continue;
    const ref = teamPresetRef(preset.slug);
    usable.set(ref, { ref, teamId: preset.teamId, name: preset.name, theme: parsed.theme });
  }
  return usable;
}

/** Members of a shared team who may manage themes (owners and admins by default) keep its presets and default. Personal teams have none. */
export function canManageTeamThemes(membership: TeamActor & { personal: boolean }): boolean {
  return !membership.personal && can(membership, "themes.manage");
}

/**
 * The shared teams (from the viewer's memberships) where the viewer manages
 * presets, so the picker offers "Save as team preset" there: owners and
 * admins only.
 */
export function manageableTeams(teams: readonly (TeamActor & { id: string; name: string; personal: boolean })[]): { teamId: string; teamName: string }[] {
  return teams.filter((row) => canManageTeamThemes(row)).map((row) => ({ teamId: row.id, teamName: row.name }));
}

/** True when another preset may be added, under the runaway cap. */
export function hasRoomForPreset(count: number): boolean {
  return count < teamPresetLimits.maxPerTeam;
}

export const TEAM_PRESET_CAP_MESSAGE = `A team can keep ${String(teamPresetLimits.maxPerTeam)} theme presets. Delete one you no longer use first.`;

/** The result of checking a preset someone wants to save. */
export type TeamPresetParse = { ok: true; value: { name: string; description: string; theme: Theme } } | { ok: false; message: string; issues: ThemeIssue[] };

const presetFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the preset a name.")
    .max(teamPresetLimits.maxNameChars, `Use ${String(teamPresetLimits.maxNameChars)} characters or fewer for the name.`),
  description: z
    .string()
    .trim()
    .max(teamPresetLimits.maxDescriptionChars, `Use ${String(teamPresetLimits.maxDescriptionChars)} characters or fewer for the description.`)
    .default(""),
  theme: z.unknown(),
});

/**
 * Checks a preset someone wants to save: a name, an optional description, and
 * theme JSON under the size limit that passes parseTheme (contrast included).
 * Invalid input returns a message and every theme issue with its path.
 */
export function parseTeamPresetInput(input: unknown): TeamPresetParse {
  const fields = presetFieldsSchema.safeParse(input);
  if (!fields.success) {
    const issue = fields.error.issues[0];
    return { ok: false, message: issue?.message ?? "Check the preset and try again.", issues: [] };
  }
  const { name, description, theme } = fields.data;
  if (JSON.stringify(theme ?? null).length > artifactThemeLimits.maxInputChars) {
    return { ok: false, message: `Theme JSON is too long. Keep it under ${String(artifactThemeLimits.maxInputChars)} characters.`, issues: [] };
  }
  const parsed = parseTheme(theme);
  if (!parsed.ok) return { ok: false, message: "The theme is not valid yet. Fix the fields marked below.", issues: parsed.issues };
  return { ok: true, value: { name, description, theme: parsed.theme } };
}

/** The name a duplicate gets: "<name> copy", trimmed to fit. */
export function duplicatePresetName(name: string): string {
  const suffix = " copy";
  return `${name.slice(0, teamPresetLimits.maxNameChars - suffix.length).trimEnd()}${suffix}`;
}

/** The result of checking a team default someone wants to set. */
export type TeamDefaultParse = { ok: true; value: string | null } | { ok: false; message: string };

/**
 * Checks a team default: null (the site default), a built-in preset id, or
 * the id of one of this team's presets (`teamRefs`).
 */
export function parseTeamDefaultInput(input: unknown, teamRefs: ReadonlySet<string>): TeamDefaultParse {
  if (input === null || input === undefined || input === "") return { ok: true, value: null };
  if (typeof input !== "string" || input.length > teamPresetLimits.maxRefChars) return { ok: false, message: "Pick a built-in theme or one of the team's presets." };
  if (builtInPresets().has(input) || teamRefs.has(input)) return { ok: true, value: input };
  return { ok: false, message: "That preset is not one of the team's. Pick a built-in theme or one of the team's presets." };
}

/** What resolving an artifact's theme needs beyond the artifact: its team default and the team presets it may use. */
export interface ArtifactThemeContext {
  /** The theme team's default (a built-in id or team preset id), or null. */
  teamDefault: string | null;
  /** Usable team presets by reference (see usableTeamPresets). */
  presets: ReadonlyMap<string, UsableTeamPreset>;
}

/** No team default and no team presets: the artifact's own theme, else the site default. */
export const emptyThemeContext: ArtifactThemeContext = { teamDefault: null, presets: new Map() };

/** A resolved theme with the name of what it came from. */
export interface NamedResolvedTheme extends ResolvedTheme {
  /** The preset's name, "Custom" for theme JSON, or "Default" for the site default. */
  name: string;
}

/**
 * The theme an artifact renders with: its own theme, then the team default,
 * then the site default (resolveTheme), where team preset ids resolve only
 * through `context.presets`. A deleted preset or one of another team is
 * absent there, so it falls through cleanly.
 */
export function resolveArtifactTheme(artifactTheme: unknown, context: ArtifactThemeContext): NamedResolvedTheme {
  const extra = new Map([...context.presets].map(([ref, preset]) => [ref, preset.theme]));
  const resolved = resolveTheme(artifactTheme, context.teamDefault, extra);
  return { ...resolved, name: resolvedName(resolved.presetId, context) };
}

function resolvedName(presetId: string | null, context: ArtifactThemeContext): string {
  if (presetId === null) return "Custom";
  return builtInPresets().get(presetId)?.name ?? context.presets.get(presetId)?.name ?? presetId;
}

/** What the delete confirmation says about a preset in use. Null usage (not loaded) says only what happens. */
export function presetDeleteMessage(usage: { artifacts: number; isDefault: boolean } | null): string {
  const fallback = "Artifacts that use it go back to the team default, then the site default.";
  if (!usage) return fallback;
  const parts = [`Used by ${String(usage.artifacts)} artifact${usage.artifacts === 1 ? "" : "s"}.`];
  if (usage.artifacts > 0) parts.push(fallback.replace("Artifacts that use it go", "They go"));
  if (usage.isDefault) parts.push("It is the team default, so the team goes back to the site default.");
  return parts.join(" ");
}
