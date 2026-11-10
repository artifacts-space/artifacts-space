"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { getSession } from "@/lib/session";
import { getTeamMembershipById, type TeamMembership } from "@/lib/teams/queries";
import { canManageTeamThemes } from "@/lib/themes/team-preset-rules";
import {
  countArtifactsUsingPreset,
  createTeamPreset,
  deleteTeamPreset,
  duplicateTeamPreset,
  restoreDefaultRevision,
  restorePresetRevision,
  setTeamDefaultTheme,
  updateTeamPreset,
  type TeamPresetDto,
} from "@/lib/themes/team-presets";
import { listDefaultRevisions, listPresetRevisions, type TeamThemeRevisionDto } from "@/lib/themes/team-theme-revisions";

/**
 * Team theme presets and the team default: team settings, so only owners
 * and admins of a shared team change them, and no artifact version is filed.
 * Agents have no path here: MCP can only list presets and use them.
 */

const idSchema = z.string().trim().min(1).max(200);

const signedOut = { success: false, error: "Your session ended. Sign in again." } as const;
const DENIED = "Only team owners and admins can change the team's themes.";

type Managed = { ok: true; membership: TeamMembership; userId: string } | { ok: false; result: { success: false; error: string } };

/** The viewer's membership when they may manage the team's themes; an error result otherwise. */
async function requireThemeManager(teamId: unknown): Promise<Managed> {
  const session = await getSession();
  if (!session) return { ok: false, result: signedOut };
  const membership = await getTeamMembershipById(session.user.id, idSchema.parse(teamId));
  if (!membership) return { ok: false, result: { success: false, error: "Team not found." } };
  if (!canManageTeamThemes(membership)) return { ok: false, result: { success: false, error: DENIED } };
  return { ok: true, membership, userId: session.user.id };
}

/** Runs one theme change for a manager, refreshing the team page and the pages that render with its themes. */
async function managed<T>(teamId: unknown, fallback: string, run: (manager: { membership: TeamMembership; userId: string }) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const checked = await requireThemeManager(teamId);
    if (!checked.ok) return checked.result;
    const data = await run(checked);
    revalidatePath(`/teams/${checked.membership.slug}`);
    revalidatePath("/artifact/[publicId]", "page");
    return { success: true, data };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, fallback) };
  }
}

/** Creates a team preset from a name, a description, and theme JSON (validated, contrast included). */
export async function createTeamPresetAction(teamId: string, input: unknown): Promise<ActionResult<TeamPresetDto>> {
  return managed(teamId, "The preset could not be saved. Try again.", ({ membership, userId }) => createTeamPreset(membership.id, userId, input));
}

/** Saves changes to a team preset. Every artifact that uses it shows the change at once. */
export async function updateTeamPresetAction(teamId: string, presetId: string, input: unknown): Promise<ActionResult<TeamPresetDto>> {
  return managed(teamId, "The preset could not be saved. Try again.", ({ membership, userId }) => updateTeamPreset(membership.id, idSchema.parse(presetId), userId, input));
}

/** Copies a team preset under a new id. */
export async function duplicateTeamPresetAction(teamId: string, presetId: string): Promise<ActionResult<TeamPresetDto>> {
  return managed(teamId, "The preset could not be copied. Try again.", ({ membership, userId }) => duplicateTeamPreset(membership.id, idSchema.parse(presetId), userId));
}

/** How many artifacts use a preset, and whether it is the team default, shown before deleting it. */
export async function presetUsageAction(teamId: string, presetId: string): Promise<ActionResult<{ artifacts: number; isDefault: boolean }>> {
  try {
    const checked = await requireThemeManager(teamId);
    if (!checked.ok) return checked.result;
    return { success: true, data: await countArtifactsUsingPreset(checked.membership.id, idSchema.parse(presetId)) };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "Could not check where the preset is used. Try again.") };
  }
}

/** Deletes a team preset. Artifacts that used it fall back to the team default, then the site default. */
export async function deleteTeamPresetAction(teamId: string, presetId: string): Promise<ActionResult<null>> {
  return managed(teamId, "The preset could not be deleted. Try again.", async ({ membership, userId }) => {
    await deleteTeamPreset(membership.id, idSchema.parse(presetId), userId);
    return null;
  });
}

/** Sets the team default theme: a built-in id, one of the team's presets, or null for the site default. Logged with who changed it. */
export async function setTeamDefaultThemeAction(teamId: string, theme: string | null): Promise<ActionResult<string | null>> {
  return managed(teamId, "The team default could not be saved. Try again.", ({ membership, userId }) =>
    setTeamDefaultTheme(membership.id, userId, z.string().max(64).nullable().parse(theme)),
  );
}

/** Reads for owners and admins only, with an error result for everyone else. */
async function managedRead<T>(teamId: unknown, fallback: string, read: (teamId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const checked = await requireThemeManager(teamId);
    if (!checked.ok) return checked.result;
    return { success: true, data: await read(checked.membership.id) };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, fallback) };
  }
}

/** A preset's saved revisions, newest first, for its history list. Owners and admins only. */
export async function presetRevisionsAction(teamId: string, presetId: string): Promise<ActionResult<TeamThemeRevisionDto[]>> {
  return managedRead(teamId, "The history could not load. Try again.", (id) => listPresetRevisions(id, idSchema.parse(presetId)));
}

/** The team default's revisions, newest first. Owners and admins only. */
export async function defaultRevisionsAction(teamId: string): Promise<ActionResult<TeamThemeRevisionDto[]>> {
  return managedRead(teamId, "The history could not load. Try again.", (id) => listDefaultRevisions(id));
}

/** Restores a preset revision's theme as a new save. Refused when that theme fails today's checks. */
export async function restorePresetRevisionAction(teamId: string, presetId: string, revisionId: string): Promise<ActionResult<TeamPresetDto>> {
  return managed(teamId, "The revision could not be restored. Try again.", ({ membership, userId }) =>
    restorePresetRevision(membership.id, idSchema.parse(presetId), idSchema.parse(revisionId), userId),
  );
}

/** Restores an earlier team default as a new change. */
export async function restoreDefaultRevisionAction(teamId: string, revisionId: string): Promise<ActionResult<string | null>> {
  return managed(teamId, "The team default could not be restored. Try again.", ({ membership, userId }) => restoreDefaultRevision(membership.id, idSchema.parse(revisionId), userId));
}
