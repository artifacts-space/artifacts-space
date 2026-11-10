"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { setCsvDownload } from "@/lib/csv-export/store";
import { getSession } from "@/lib/session";

/**
 * "Allow CSV download", from the artifact page's More menu. Only the author
 * and the team's owners and admins change it (setCsvDownload checks), as
 * people in the web app; agents never can.
 */

const inputSchema = z.object({ artifactId: z.string().trim().min(1).max(200), on: z.boolean() });

/** Turns CSV downloads for readers on or off. Returns the setting as saved. */
export async function setCsvDownloadAction(artifactId: string, on: boolean): Promise<ActionResult<boolean>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    const input = inputSchema.parse({ artifactId, on });
    const saved = await setCsvDownload({ actorId: session.user.id, artifactId: input.artifactId, on: input.on, actor: "person" });
    revalidatePath(`/artifact/${saved.publicId}`);
    return { success: true, data: saved.allowCsvDownload };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The download setting did not change. Try again.") };
  }
}
