import { z } from "zod";

import { publicIdForRef } from "@/lib/artifact-ref/resolve";
import { artifactRefProblemMessage, parseArtifactRef, unresolvedRefMessage } from "@/lib/artifact-ref/rules";
import { isPublicId } from "@/lib/public-id";
import { siteOrigin } from "@/lib/site-origin";

/** What every artifact input says it takes. */
export const ARTIFACT_REF_WORDS = "its 22-character id, or its link";

/**
 * Looks up the artifact an older value (an internal id, a legacy share
 * link) names, through the read decision: no public id when it names
 * nothing this caller can read; "failed" when the lookup itself failed.
 */
async function lookUp(ref: Parameters<typeof publicIdForRef>[0], userId: string): Promise<{ publicId: string | null } | "failed"> {
  try {
    return { publicId: await publicIdForRef(ref, userId) };
  } catch (error) {
    console.error("[mcp] Artifact reference lookup failed", error instanceof Error ? error.name : "unknown error");
    return "failed";
  }
}

/**
 * The input every MCP tool takes for "which artifact": the 22-character
 * id, or the artifact's link on this deployment in any form the app gives
 * out (src/lib/artifact-ref/rules.ts). The tool's handler always receives
 * the 22-character id, so nothing after this field changes, and each tool
 * still runs its own access check on it.
 *
 * A value that is not an artifact reference is refused with what it looked
 * like and what to do next. An internal id, which the workspace copied
 * until it copied the link, is resolved for `userId` through the read
 * decision: a caller who may not read the artifact gets the words an
 * unknown id gets. A link is never fetched.
 */
export function artifactRefField(userId: string, description = `The artifact: ${ARTIFACT_REF_WORDS}`) {
  return z
    .string()
    .describe(description)
    .transform(async (value, context): Promise<string> => {
      // An id is taken as it is, as before: no origin and no lookup are needed for it.
      if (isPublicId(value)) return value;
      const refuse = (message: string) => {
        context.issues.push({ code: "custom", message, input: value });
        return z.NEVER;
      };
      const origin = siteOrigin();
      const parsed = parseArtifactRef(value, origin);
      if (!parsed.ok) return refuse(artifactRefProblemMessage(parsed.problem, value, origin));
      if (parsed.ref.kind === "publicId") return parsed.ref.publicId;
      const found = await lookUp(parsed.ref, userId);
      if (found === "failed") return refuse("Could not look this id up. Try again, or give the artifact's 22-character id or its link.");
      return found.publicId ?? refuse(unresolvedRefMessage(parsed.ref.kind, value, origin));
    })
    .describe(description);
}
