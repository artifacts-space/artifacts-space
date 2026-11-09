"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { fitsSheetFormatInput, type SheetFormat, sheetFormatSchema } from "@/lib/sheet-format/rules";
import { setSheetFormat } from "@/lib/sheet-format/store";
import { getSession } from "@/lib/session";

/**
 * A sheet's formatting (banding and column alignment), from the CSV grid.
 * Only people who may edit the artifact change it (setSheetFormat checks);
 * it files no version and never waits for approval.
 */

const inputSchema = z.object({ artifactId: z.string().trim().min(1).max(200), format: sheetFormatSchema });

/** Saves the sheet's formatting. Returns the formatting as saved. */
export async function setSheetFormatAction(artifactId: string, format: SheetFormat): Promise<ActionResult<SheetFormat>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Your session ended. Sign in again." };
    if (!fitsSheetFormatInput(format)) return { success: false, error: "This formatting is too large to save." };
    const input = inputSchema.parse({ artifactId, format });
    const saved = await setSheetFormat(session.user.id, input.artifactId, input.format);
    if (!saved) return { success: false, error: "Artifact not found, or you cannot edit it." };
    revalidatePath("/app");
    revalidatePath(`/artifact/${saved.publicId}`);
    return { success: true, data: saved.format };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The formatting did not change. Try again.") };
  }
}
