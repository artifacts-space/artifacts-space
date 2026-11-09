"use server";

import { revalidatePath } from "next/cache";

import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { removeTeamIcon, saveTeamIcon } from "@/lib/teams/team-icon";
import { canManageTeamIcon, TEAM_ICON_STORED_MAX_BYTES } from "@/lib/teams/team-icon-rules";
import { UserFacingError } from "@/lib/user-facing-error";

import { guardTeam } from "./team-guard";

const denied = "Only people who can change team settings can change the team icon.";

/** The picked icon in the form, or a message for people when there is none or it is too large to read. */
function iconFile(form: FormData): File | string {
  const file = form.get("icon");
  if (!(file instanceof File)) return "Pick an image to upload.";
  if (file.size === 0) return "That file is empty. Pick another image.";
  if (file.size > TEAM_ICON_STORED_MAX_BYTES) return "The icon can be at most 512 KB.";
  return file;
}

/**
 * Uploads a new team icon, replacing any old one. The browser sends a
 * square PNG or WebP it already cropped and resized; the server checks the
 * bytes again (team-icon-rules.ts) and never trusts the name or type. Needs
 * "change team settings" in a shared team, and counts toward the person's
 * hourly upload limit.
 */
export async function uploadTeamIconAction(teamId: string, form: FormData): Promise<ActionResult<null>> {
  try {
    const checked = await guardTeam(teamId, canManageTeamIcon, denied);
    if (!checked.ok) return checked.result;
    const file = iconFile(form);
    if (typeof file === "string") return { success: false, error: file };
    await enforceRateLimit("fileUpload", checked.membership.userId);
    await saveTeamIcon(checked.membership.id, new Uint8Array(await file.arrayBuffer()));
    revalidatePath(`/teams/${checked.membership.slug}`);
    return { success: true, data: null };
  } catch (error) {
    if (!(error instanceof UserFacingError)) console.error("[team-icon] Upload failed", error instanceof Error ? error.name : "unknown error");
    return { success: false, error: actionErrorMessage(error, "The icon could not be saved. Please try again.") };
  }
}

/** Removes the team icon and deletes its file. Needs "change team settings" in a shared team. */
export async function removeTeamIconAction(teamId: string): Promise<ActionResult<null>> {
  try {
    const checked = await guardTeam(teamId, canManageTeamIcon, denied);
    if (!checked.ok) return checked.result;
    await removeTeamIcon(checked.membership.id);
    revalidatePath(`/teams/${checked.membership.slug}`);
    return { success: true, data: null };
  } catch (error) {
    if (!(error instanceof UserFacingError)) console.error("[team-icon] Remove failed", error instanceof Error ? error.name : "unknown error");
    return { success: false, error: actionErrorMessage(error, "The icon could not be removed. Please try again.") };
  }
}
