import { redirect } from "next/navigation";
import { z } from "zod";

import type { TeamRoleView } from "@/lib/teams/capabilities";
import { getTeamAccessById, type TeamMembership } from "@/lib/teams/queries";
import { getSession } from "@/lib/session";

/**
 * The one entry check for the team server actions (actions.ts and
 * role-actions.ts): a signed-in user, their membership in the team, and the
 * team's roles from the same load. Each action then decides with
 * capability-rules.ts through `allowed`.
 */

export const idSchema = z.string().trim().min(1).max(200);

/** The signed-in user, or a redirect to sign in. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}

export type Guarded = { ok: true; membership: TeamMembership; roles: ReadonlyMap<string, TeamRoleView> } | { ok: false; result: { success: false; error: string } };

/** The viewer's membership and the team's roles when `allowed` passes; "Team not found." when they are not in it. */
export async function guardTeam(teamId: string, allowed: (membership: TeamMembership) => boolean, denied: string): Promise<Guarded> {
  const viewer = await requireUser();
  const access = await getTeamAccessById(viewer.id, idSchema.parse(teamId));
  if (!access) return { ok: false, result: { success: false, error: "Team not found." } };
  if (!allowed(access.membership)) return { ok: false, result: { success: false, error: denied } };
  return { ok: true, ...access };
}
