"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { getSession } from "@/lib/session";
import { loadTeamRoles, type TeamRoleView } from "@/lib/teams/capabilities";
import { capabilityChangeProblem, createRoleProblem, customRoleKey, customRoleNameProblem, deleteRoleProblem } from "@/lib/teams/role-admin-rules";
import { cleanCapabilities, createCustomRole, deleteCustomRole, saveRoleCapabilities, writePermissionAudit } from "@/lib/teams/role-store";
import { getTeamMembershipById, type TeamMembership } from "@/lib/teams/queries";

/**
 * Editing a team's roles from the Permissions tab. Every action loads the
 * viewer's membership and asks role-admin-rules.ts (which asks `can`), so
 * nobody grants a capability they do not hold or edits a role at or above
 * their own. Every change writes an audit row.
 */

const idSchema = z.string().trim().min(1).max(200);
const roleKeySchema = z.string().trim().min(1).max(40);
const capabilitiesSchema = z.array(z.string().max(40)).max(40);

type Loaded = { ok: true; membership: TeamMembership; roles: Map<string, TeamRoleView> } | { ok: false; result: { success: false; error: string } };

async function loadEditor(teamId: string): Promise<Loaded> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const membership = await getTeamMembershipById(session.user.id, idSchema.parse(teamId));
  if (!membership || membership.personal) return { ok: false, result: { success: false, error: "Team not found." } };
  const roles = (await loadTeamRoles([membership.id])).get(membership.id) ?? new Map<string, TeamRoleView>();
  return { ok: true, membership, roles };
}

function refresh(membership: TeamMembership) {
  revalidatePath(`/teams/${membership.slug}`);
}

/** Replaces what one role may do. Locked cells and capabilities the viewer does not hold are refused. */
export async function updateRoleCapabilitiesAction(teamId: string, roleKey: string, capabilities: string[]): Promise<ActionResult<null>> {
  try {
    const loaded = await loadEditor(teamId);
    if (!loaded.ok) return loaded.result;
    const { membership, roles } = loaded;
    const role = roles.get(roleKeySchema.parse(roleKey));
    if (!role) return { success: false, error: "That role does not exist in this team." };
    const next = cleanCapabilities(capabilitiesSchema.parse(capabilities));
    const problem = capabilityChangeProblem(membership, role.key, role.capabilities, next);
    if (problem) return { success: false, error: problem };
    await saveRoleCapabilities({ teamId: membership.id, key: role.key, name: role.name, builtIn: role.builtIn, capabilities: next });
    await writePermissionAudit({ teamId: membership.id, actorId: membership.userId, action: "role_updated", subject: role.name, before: role.capabilities, after: next });
    refresh(membership);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The role could not be saved. Please try again.") };
  }
}

const newRoleSchema = z.object({ name: z.string().max(80), capabilities: capabilitiesSchema });

/** Creates a custom role, between Member and Admin, with capabilities the viewer holds. */
export async function createRoleAction(teamId: string, input: z.input<typeof newRoleSchema>): Promise<ActionResult<{ key: string }>> {
  try {
    const loaded = await loadEditor(teamId);
    if (!loaded.ok) return loaded.result;
    const { membership, roles } = loaded;
    const parsed = newRoleSchema.parse(input);
    const name = parsed.name.trim();
    const capabilities = cleanCapabilities(parsed.capabilities);
    const problem = customRoleNameProblem(name) ?? createRoleProblem(membership, capabilities);
    if (problem) return { success: false, error: problem };
    const key = customRoleKey(name);
    if (roles.has(key)) return { success: false, error: "A role with that name already exists." };
    await createCustomRole({ teamId: membership.id, key, name, capabilities });
    await writePermissionAudit({ teamId: membership.id, actorId: membership.userId, action: "role_created", subject: name, before: null, after: capabilities });
    refresh(membership);
    return { success: true, data: { key } };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The role could not be created. Please try again.") };
  }
}

/** Deletes a custom role. People who had it keep their built-in role, Member unless an owner changes it. */
export async function deleteRoleAction(teamId: string, roleKey: string): Promise<ActionResult<null>> {
  try {
    const loaded = await loadEditor(teamId);
    if (!loaded.ok) return loaded.result;
    const { membership, roles } = loaded;
    const role = roles.get(roleKeySchema.parse(roleKey));
    if (!role) return { success: false, error: "That role does not exist in this team." };
    const problem = deleteRoleProblem(membership, role.key);
    if (problem) return { success: false, error: problem };
    await deleteCustomRole(membership.id, role.key);
    await writePermissionAudit({ teamId: membership.id, actorId: membership.userId, action: "role_deleted", subject: role.name, before: role.capabilities, after: null });
    refresh(membership);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The role could not be deleted. Please try again.") };
  }
}
