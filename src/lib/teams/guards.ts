import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { team } from "@/db/schema";
import { cleanHandleInput, validateHandle } from "@/lib/handles";

import { can, type TeamCapability } from "./capability-rules";
import { getTeamAccessById, getTeamMembershipById } from "./queries";
import { inviteProblem } from "./role-admin-rules";
import { assignableRoles } from "./roles";
import { isHandleAvailable } from "./setup";

/**
 * Rules Better Auth's team (organization) endpoints must follow, whether they
 * are called from our server actions or straight over HTTP. Each guard throws
 * an APIError with a message that is safe to show.
 */

export const TEAM_NAME_MAX_LENGTH = 80;

const teamFlagsSchema = z.object({ personal: z.boolean().optional() });

function reject(message: string): never {
  throw new APIError("BAD_REQUEST", { message });
}

/** Personal teams belong to one person: no invitations, members, or role changes. */
export function assertNotPersonal(organization: unknown, action: string) {
  const flags = teamFlagsSchema.safeParse(organization);
  if (!flags.success || flags.data.personal === true) reject(`Personal teams cannot ${action}.`);
}

/** Validates a team name and returns it trimmed. */
export function cleanTeamName(name: unknown) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) reject("Give the team a name.");
  if (trimmed.length > TEAM_NAME_MAX_LENGTH) reject(`Use ${String(TEAM_NAME_MAX_LENGTH)} characters or fewer for the name.`);
  return trimmed;
}

/** Checks a new team's slug and fills in the fields only the server may set. */
export async function prepareNewTeam(data: { name?: unknown; slug?: unknown }, userId: string) {
  const name = cleanTeamName(data.name);
  const slug = cleanHandleInput(typeof data.slug === "string" ? data.slug : "");
  const problem = validateHandle(slug);
  if (problem) reject(problem);
  if (!(await isHandleAvailable(slug))) reject("That team URL is taken. Try another one.");
  return { name, slug, personal: false, createdBy: userId };
}

/** Team settings a team update may change. Anything else is refused, so a new field is never open by accident. */
const changeableTeamSettings = new Set(["name", "teamSharingNeedsApproval"]);

/**
 * Team settings (the sharing rule and the name) change only for people who
 * may change the sharing rule (owners by default); slugs never change, and
 * personal teams stay as they are. Returns the cleaned values to store: a
 * new name, trimmed and length-checked.
 */
export async function assertTeamUpdateAllowed(update: Record<string, unknown>, member: { organizationId: string; userId: string }): Promise<{ name?: string }> {
  const [current] = await getDb().select({ personal: team.personal }).from(team).where(eq(team.id, member.organizationId)).limit(1);
  if (!current) reject("Team not found.");
  if (current.personal) reject("Personal team settings cannot change.");
  if ("slug" in update && update.slug !== undefined) reject("A team's URL cannot change.");
  const changing = Object.keys(update).filter((key) => update[key] !== undefined);
  if (changing.some((key) => !changeableTeamSettings.has(key))) reject("That team setting cannot change.");
  if (changing.length > 0) await assertTeamCapability(member.userId, member.organizationId, "settings.sharing");
  if (changing.includes("name")) return { name: cleanTeamName(update.name) };
  return {};
}

/**
 * Refuses an invitation unless the inviter may invite people and the role
 * does no more than theirs (inviteProblem), the same rule as the invite
 * action, so Better Auth's hook fails closed on its own. Fails closed.
 */
export async function assertCanInviteAs(inviterId: string, teamId: string, roleKey: string) {
  const access = await getTeamAccessById(inviterId, teamId);
  const role = access?.roles.get(roleKey);
  const problem = role ? inviteProblem(access?.membership ?? null, { key: role.key, capabilities: role.capabilities }) : "That role does not exist in this team.";
  if (problem) reject(problem);
}

/** Refuses a Better Auth call unless the acting user is a person in the team who holds `capability`. Fails closed. */
export async function assertTeamCapability(userId: string, teamId: string, capability: TeamCapability) {
  const actor = await getTeamMembershipById(userId, teamId);
  if (actor?.kind !== "person" || !can(actor, capability)) reject("You do not have permission to do that in this team.");
}

/** Invitations offer the admin or member role; owners are made from the team page. */
export function assertInvitableRole(role: unknown) {
  const roles = typeof role === "string" ? role.split(",").map((part) => part.trim()) : [];
  const allowed = new Set<string>(assignableRoles);
  if (roles.length === 0 || roles.some((part) => !allowed.has(part))) reject("Invite people as a member or an admin.");
}
