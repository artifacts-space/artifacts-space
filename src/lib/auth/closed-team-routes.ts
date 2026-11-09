import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { z } from "zod";

import type { TeamCapability } from "@/lib/teams/capability-rules";
import { assertTeamCapability } from "@/lib/teams/guards";

import { teamRoutesClosedOverHttp } from "./teams-plugin";

const closed = new Set(teamRoutesClosedOverHttp);

/**
 * The capability the acting user needs for each team route whose Better Auth
 * hook sees only the target (1.7: `beforeUpdateMemberRole` and
 * `beforeRemoveMember` get the member being changed, not who changes them).
 * Our server actions check first; this checks again on the call itself.
 */
export const actorCheckedTeamRoutes: Readonly<Record<string, TeamCapability>> = {
  "/organization/update-member-role": "members.roles",
  "/organization/remove-member": "members.remove",
};

const teamBody = z.object({ organizationId: z.string().min(1) });

/**
 * Locks on the team routes. Closed routes: `disabledPaths` matches the raw
 * URL, and this matches the route Better Auth resolved, so another spelling
 * of the URL cannot reach them; in-process calls from our server actions
 * carry no request and pass. Role changes and removals: the acting user,
 * from the call's session, must hold the capability in that team, so even an
 * in-process call that skipped our action's checks fails closed.
 */
export const closedTeamRoutesHook = createAuthMiddleware(async (ctx) => {
  if (ctx.request && closed.has(ctx.path)) throw new APIError("NOT_FOUND", { message: "Not found" });
  const capability = actorCheckedTeamRoutes[ctx.path];
  if (!capability) return;
  const [session, body] = [await getSessionFromCtx(ctx), teamBody.safeParse(ctx.body)];
  if (!session || !body.success) throw new APIError("FORBIDDEN", { message: "You do not have permission to do that in this team." });
  await assertTeamCapability(session.user.id, body.data.organizationId, capability);
});
