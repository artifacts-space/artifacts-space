"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getEditableArtifact } from "@/lib/access";
import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult, ArtifactDto } from "@/lib/artifact-types";
import { artifactIconInputSchema } from "@/lib/artifact-icons";
import { artifactCoverInputSchema } from "@/lib/covers/cover";
import { toArtifactDtos, updateArtifact } from "@/lib/artifacts";
import { isPublicId } from "@/lib/public-id";
import type { StoredArtifactTheme } from "@/lib/themes/artifact-theme";
import { getSession } from "@/lib/session";
import { UserFacingError } from "@/lib/user-facing-error";

const publicIdSchema = z.string().refine(isPublicId, "Artifact not found.");
/** The web picker sends a preset id or null; updateArtifact checks the id is a real preset. */
const presetIdSchema = z.string().max(64).nullable();

/** What setting the icon did: live for every reader, or waiting for approval (link and public artifacts). */
export interface IconSaveResult {
  icon: string | null;
  pending: boolean;
}

/** What setting the theme did: live for every reader, or waiting for approval (link and public artifacts). */
export interface ThemeSaveResult {
  theme: StoredArtifactTheme | null;
  pending: boolean;
}

/**
 * The latest saved artifact, for the in-place editor on its page. Only the
 * author and members of the team it is shared through get it; everyone else
 * gets "not found". The page itself may be cached, so the editor always
 * loads its own copy from the signed-in session.
 */
export async function loadEditableArtifactAction(publicId: string): Promise<ActionResult<ArtifactDto>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    const record = await getEditableArtifact(session.user.id, { publicId: publicIdSchema.parse(publicId) });
    if (!record) throw new UserFacingError("Artifact not found, or you cannot edit it.");
    const [dto] = await toArtifactDtos([record], session.user.id);
    if (!dto) throw new UserFacingError("Artifact not found.");
    return { success: true, data: dto };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The artifact could not load for editing. Try again.") };
  }
}

/**
 * Sets or removes the page icon from the artifact's title area. The same
 * edit check and save path as any other change (updateArtifact as a
 * person), so it files a version and, for link and public artifacts, waits
 * for approval exactly like a title change.
 */
export async function setArtifactIconAction(publicId: string, icon: string | null): Promise<ActionResult<IconSaveResult>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    const id = publicIdSchema.parse(publicId);
    const nextIcon = artifactIconInputSchema.parse(icon);
    const record = await getEditableArtifact(session.user.id, { publicId: id });
    if (!record) throw new UserFacingError("Artifact not found, or you cannot edit it.");
    const saved = await updateArtifact(session.user.id, record.id, { icon: nextIcon }, "person");
    if (!saved) throw new UserFacingError("Artifact not found, or you cannot edit it.");
    revalidatePath("/app");
    revalidatePath(`/artifact/${saved.publicId}`);
    return { success: true, data: { icon: saved.icon, pending: saved.pendingEdit !== null } };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The icon could not be saved. Try again.") };
  }
}

/**
 * Sets or removes the artifact's theme from its title area: a built-in
 * preset id, or null for the default look. The same edit check and save path
 * as a title or icon change (updateArtifact as a person), so it files a
 * version and, for link and public artifacts, waits for approval.
 */
export async function setArtifactThemeAction(publicId: string, theme: string | null): Promise<ActionResult<ThemeSaveResult>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    const id = publicIdSchema.parse(publicId);
    const nextTheme = presetIdSchema.parse(theme);
    const record = await getEditableArtifact(session.user.id, { publicId: id });
    if (!record) throw new UserFacingError("Artifact not found, or you cannot edit it.");
    const saved = await updateArtifact(session.user.id, record.id, { theme: nextTheme }, "person");
    if (!saved) throw new UserFacingError("Artifact not found, or you cannot edit it.");
    revalidatePath("/app");
    revalidatePath(`/artifact/${saved.publicId}`);
    return { success: true, data: { theme: saved.theme, pending: saved.pendingEdit !== null } };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The theme could not be saved. Try again.") };
  }
}

/** What setting the cover did: live for every reader, or waiting for approval (link and public artifacts). */
export interface CoverSaveResult {
  cover: string | null;
  pending: boolean;
}

/**
 * Sets, repositions, or removes the artifact's cover from its page: a
 * gradient id, "file:<uuid>[@0-100]" for an uploaded image, or null. The same
 * edit check and save path as a title, icon, or theme change (updateArtifact
 * as a person), so it files a version and, for link and public artifacts,
 * waits for approval.
 */
export async function setArtifactCoverAction(publicId: string, cover: string | null): Promise<ActionResult<CoverSaveResult>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    const id = publicIdSchema.parse(publicId);
    const nextCover = artifactCoverInputSchema.parse(cover);
    const record = await getEditableArtifact(session.user.id, { publicId: id });
    if (!record) throw new UserFacingError("Artifact not found, or you cannot edit it.");
    const saved = await updateArtifact(session.user.id, record.id, { cover: nextCover }, "person");
    if (!saved) throw new UserFacingError("Artifact not found, or you cannot edit it.");
    revalidatePath("/app");
    revalidatePath(`/artifact/${saved.publicId}`);
    return { success: true, data: { cover: saved.cover, pending: saved.pendingEdit !== null } };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The cover could not be saved. Try again.") };
  }
}
