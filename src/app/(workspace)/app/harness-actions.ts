"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult, ArtifactHarnessDto } from "@/lib/artifact-types";
import { setArtifactHarnessOverride } from "@/lib/harness/artifact-harness-store";
import type { McpConnectionRef } from "@/lib/harness/connection-ref";
import { setConnectionHarnessOverride } from "@/lib/harness/connection-store";
import { harnessIds, type HarnessId } from "@/lib/harness/harnesses";
import { getSession } from "@/lib/session";

/**
 * Changing which agent harness made something, when detection got it wrong:
 * for one of the person's own connections (applies to its later saves), or
 * for one artifact they may edit (no version, no approval).
 */

const harnessChoice = z.enum(harnessIds).nullable();

const connectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("oauth"), clientId: z.string().trim().min(1).max(512) }),
  z.object({ kind: z.literal("api-token"), tokenId: z.string().trim().min(1).max(200) }),
]);

/** A connection the person picks on the Connections page: an approved app or one of their tokens. */
export type ConnectionTarget = z.input<typeof connectionSchema>;

const NOT_SIGNED_IN = "Your session ended. Sign in again.";

/** Sets or clears the harness for one of the signed-in person's connections. Returns the override as saved. */
export async function setConnectionHarnessAction(target: ConnectionTarget, harness: HarnessId | null): Promise<ActionResult<HarnessId | null>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: NOT_SIGNED_IN };
    const parsed = connectionSchema.parse(target);
    const choice = harnessChoice.parse(harness);
    const ref: McpConnectionRef = parsed.kind === "oauth" ? { kind: "oauth", userId: session.user.id, clientId: parsed.clientId } : { kind: "api-token", userId: session.user.id, tokenId: parsed.tokenId };
    if (!(await setConnectionHarnessOverride(ref, choice))) return { success: false, error: "Could not find that connection." };
    revalidatePath("/app/connections");
    return { success: true, data: choice };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The agent did not change. Try again.") };
  }
}

const artifactInput = z.object({ artifactId: z.string().trim().min(1).max(200), harness: harnessChoice });

/** Sets or clears the harness one artifact shows. Only people who may edit it can. */
export async function setArtifactHarnessAction(artifactId: string, harness: HarnessId | null): Promise<ActionResult<ArtifactHarnessDto | null>> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: NOT_SIGNED_IN };
    const input = artifactInput.parse({ artifactId, harness });
    const saved = await setArtifactHarnessOverride(session.user.id, input.artifactId, input.harness);
    if (!saved) return { success: false, error: "Artifact not found, or you cannot edit it." };
    revalidatePath("/app");
    revalidatePath(`/artifact/${saved.publicId}`);
    return { success: true, data: saved.harness };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The agent did not change. Try again.") };
  }
}
