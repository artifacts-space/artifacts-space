import { createAuthMiddleware } from "better-auth/api";
import { z } from "zod";

import { reconcileTeamArtifacts } from "@/lib/sharing/transfer";

/**
 * Moves artifacts a departed member shared with the team to a team owner.
 * Errors are logged, not thrown: the member is already gone, and the next
 * departure (or a rerun) repairs the team, because reconcile is idempotent.
 */
export async function reconcileAfterDeparture(teamId: string) {
  try {
    await reconcileTeamArtifacts(teamId);
  } catch (error) {
    console.error("[teams] Artifact transfer after a departure failed", error instanceof Error ? error.message : "unknown error");
  }
}

const leaveBody = z.object({ organizationId: z.string().min(1) });

/**
 * Better Auth's leave endpoint has no member hook, so this after-hook runs the
 * transfer when someone leaves a team, whether through our action or over HTTP.
 */
export const teamDepartureHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/organization/leave") return;
  const body = leaveBody.safeParse(ctx.body);
  if (body.success) await reconcileAfterDeparture(body.data.organizationId);
});
