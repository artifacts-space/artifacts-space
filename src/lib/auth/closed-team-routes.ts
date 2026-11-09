import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { z } from "zod";

import { assertMemberChangeAllowed } from "@/lib/teams/member-change-guard";

import { teamRoutesClosedOverHttp } from "./teams-plugin";

const closed = new Set(teamRoutesClosedOverHttp);

/**
 * Team routes whose Better Auth hook sees only the target (1.7:
 * `beforeUpdateMemberRole` and `beforeRemoveMember` get the member being
 * changed, not who changes them), with how to read the request. Our server
 * actions check first; the hook below checks the full rule again on the
 * call itself (member-change-guard.ts).
 */
const roleChange = z.object({ organizationId: z.string().min(1), memberId: z.string().min(1), role: z.string().min(1) });
const removal = z.object({ organizationId: z.string().min(1), memberIdOrEmail: z.string().min(1).refine((value) => !value.includes("@"), "Remove members by id.") });

/** The member change a request asks for, or null when the path is not one of these routes. Unreadable requests are refused. */
export function requestedMemberChange(path: string, body: unknown): { teamId: string; memberId: string; nextRole: string | null } | null {
  if (path === "/organization/update-member-role") {
    const parsed = roleChange.safeParse(body);
    if (!parsed.success) throw new APIError("FORBIDDEN", { message: "You do not have permission to do that in this team." });
    return { teamId: parsed.data.organizationId, memberId: parsed.data.memberId, nextRole: parsed.data.role };
  }
  if (path === "/organization/remove-member") {
    const parsed = removal.safeParse(body);
    if (!parsed.success) throw new APIError("FORBIDDEN", { message: "You do not have permission to do that in this team." });
    return { teamId: parsed.data.organizationId, memberId: parsed.data.memberIdOrEmail, nextRole: null };
  }
  return null;
}

/** The routes the hook checks for the acting user, so a test can keep them closed over HTTP too. */
export const actorCheckedTeamRoutes = ["/organization/update-member-role", "/organization/remove-member"] as const;

/**
 * Locks on the team routes. Closed routes: `disabledPaths` matches the raw
 * URL, and this matches the route Better Auth resolved, so another spelling
 * of the URL cannot reach them; in-process calls from our server actions
 * carry no request and pass. Role changes and removals: the acting user,
 * from the call's session, must pass the same rules as the server actions,
 * so even an in-process call that skipped them fails closed.
 */
export const closedTeamRoutesHook = createAuthMiddleware(async (ctx) => {
  if (ctx.request && closed.has(ctx.path)) throw new APIError("NOT_FOUND", { message: "Not found" });
  const change = requestedMemberChange(ctx.path, ctx.body);
  if (!change) return;
  const session = await getSessionFromCtx(ctx);
  if (!session) throw new APIError("FORBIDDEN", { message: "You do not have permission to do that in this team." });
  await assertMemberChangeAllowed({ actorId: session.user.id, ...change });
});
