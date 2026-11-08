import { createAuthMiddleware } from "better-auth/api";
import { z } from "zod";

import { reconcileTeamAgents } from "@/lib/agents/handover";
import { reconcileTeamArtifacts } from "@/lib/sharing/transfer";

/**
 * After someone leaves or is removed: hands the agents they added to a team
 * owner with their tokens revoked (src/lib/agents/handover.ts), and moves the
 * artifacts they shared with the team to that owner. Errors are logged, not
 * thrown: the member is already gone, and the next departure (or a rerun)
 * repairs the team, because both steps are idempotent.
 */
export async function reconcileAfterDeparture(teamId: string) {
  const steps = [
    { name: "Agent handover", run: () => reconcileTeamAgents(teamId) },
    { name: "Artifact transfer", run: () => reconcileTeamArtifacts(teamId) },
  ];
  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      console.error(`[teams] ${step.name} after a departure failed`, error instanceof Error ? error.message : "unknown error");
    }
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
