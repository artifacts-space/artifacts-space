"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { networkKey } from "@/lib/abuse/network-key";
import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { isPublicId } from "@/lib/public-id";
import { submitReport } from "@/lib/reports/service";
import { getSession } from "@/lib/session";

const publicIdSchema = z.string().refine(isPublicId, "Artifact not found.");

/**
 * Reports a link or public artifact. Works signed out; limited per network
 * and per signed-in user. The report goes to the approving team's owners.
 */
export async function reportArtifactAction(publicId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const [session, requestHeaders] = await Promise.all([getSession(), headers()]);
    await submitReport({
      publicId: publicIdSchema.parse(publicId),
      viewerId: session?.user.id ?? null,
      networkKey: networkKey(requestHeaders),
      report: input,
    });
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The report could not be sent. Please try again.") };
  }
}
