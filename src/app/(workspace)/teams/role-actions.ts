"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/artifact-types";
import { isTeamCapability } from "@/lib/teams/capability-rules";
import { toggledCapabilities } from "@/lib/teams/permission-matrix-rules";
import { capabilityChangeProblem, createRoleProblem, customRoleKey, customRoleNameProblem, deleteRoleProblem } from "@/lib/teams/role-admin-rules";
import { cleanCapabilities, createCustomRole, deleteCustomRole, setRoleCapability } from "@/lib/teams/role-store";
import type { TeamMembership } from "@/lib/teams/queries";

import { guardTeam } from "./team-guard";

/**
 * Editing a team's roles from the Permissions tab. Every action loads the
 * viewer's membership and asks role-admin-rules.ts (which asks `can`), so
 * nobody grants a capability they do not hold or edits a role at or above
 * their own. Every change writes an audit row.
 */

const roleKeySchema = z.string().trim().min(1).max(40);
const capabilitiesSchema = z.array(z.string().max(40)).max(40);

/** A person's membership in a shared team (never an agent's token), with the team's roles. Each action then asks role-admin-rules.ts. */
function loadEditor(teamId: string) {
  return guardTeam(teamId, (membership) => membership.kind === "person" && !membership.personal, "Team not found.");
}

function refresh(membership: TeamMembership) {
  revalidatePath(`/teams/${membership.slug}`);
}

/**
 * Turns one capability of one role on or off: one cell of the matrix. Locked
 * cells, roles at or above the viewer's, and capabilities the viewer does not
 * hold are refused. Only that cell changes, with its audit row.
 */
export async function updateRoleCapabilityAction(teamId: string, roleKey: string, capability: string, on: boolean): Promise<ActionResult<null>> {
  try {
    const loaded = await loadEditor(teamId);
    if (!loaded.ok) return loaded.result;
    const { membership, roles } = loaded;
    const role = roles.get(roleKeySchema.parse(roleKey));
    if (!role) return { success: false, error: "That role does not exist in this team." };
    if (!isTeamCapability(capability)) return { success: false, error: "That capability does not exist." };
    const turnOn = z.boolean().parse(on);
    const next = toggledCapabilities(role, capability, turnOn);
    const problem = capabilityChangeProblem(membership, role.key, role.capabilities, next);
    if (problem) return { success: false, error: problem };
    const audit = { actorId: membership.userId, action: "role_updated" as const, subject: role.name, before: role.capabilities, after: next };
    await setRoleCapability({ teamId: membership.id, key: role.key, name: role.name, builtIn: role.builtIn, capability, on: turnOn, next, audit });
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
    await createCustomRole({ teamId: membership.id, key, name, capabilities, audit: { actorId: membership.userId, action: "role_created", subject: name, before: null, after: capabilities } });
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
    await deleteCustomRole({ teamId: membership.id, key: role.key, audit: { actorId: membership.userId, action: "role_deleted", subject: role.name, before: role.capabilities, after: null } });
    refresh(membership);
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The role could not be deleted. Please try again.") };
  }
}
