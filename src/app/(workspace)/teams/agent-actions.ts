"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { actionErrorMessage } from "@/lib/action-errors";
import type { AgentTokenView } from "@/lib/agents/queries";
import { createAgent, createAgentToken, removeAgent, revokeAgentToken, setAgentTeamMute } from "@/lib/agents/service";
import type { ActionResult } from "@/lib/artifact-types";
import { getSession } from "@/lib/session";

/**
 * Agent teammate actions for the team page. The agents service checks that
 * the viewer is an owner or admin of the agent's team on every call.
 */

const idSchema = z.string().trim().min(1).max(200);
const createSchema = z.object({
  handle: z.string().trim().min(1, "Choose a handle.").max(40),
  name: z.string().trim().min(1, "Give the agent a name.").max(80, "Use 80 characters or fewer for the name."),
});
const tokenNameSchema = z.string().trim().min(1, "Give this token a name.").max(80, "Use 80 characters or fewer for the token name.");

async function requireUserId() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user.id;
}

function refreshTeams() {
  revalidatePath("/teams", "layout");
}

/** Adds an agent to a shared team. */
export async function createAgentAction(teamId: string, input: z.input<typeof createSchema>): Promise<ActionResult<{ handle: string }>> {
  const actorId = await requireUserId();
  try {
    const { handle, name } = createSchema.parse(input);
    const created = await createAgent({ actorId, teamId: idSchema.parse(teamId), handle, name });
    refreshTeams();
    return { success: true, data: { handle: created.handle } };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The agent could not be added. Please try again.") };
  }
}

/** Removes an agent for good, with its tokens. */
export async function removeAgentAction(agentId: string): Promise<ActionResult<null>> {
  const actorId = await requireUserId();
  try {
    await removeAgent({ actorId, agentId: idSchema.parse(agentId) });
    refreshTeams();
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The agent could not be removed. Please try again.") };
  }
}

/** Mutes or unmutes an agent across the team. */
export async function setAgentMuteAction(agentId: string, muted: boolean): Promise<ActionResult<null>> {
  const actorId = await requireUserId();
  try {
    await setAgentTeamMute({ actorId, agentId: idSchema.parse(agentId), muted: z.boolean().parse(muted) });
    refreshTeams();
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The mute could not be changed. Please try again.") };
  }
}

/** Creates a token for an agent. The secret comes back once. */
export async function createAgentTokenAction(agentId: string, name: string): Promise<ActionResult<{ token: string; record: AgentTokenView }>> {
  const actorId = await requireUserId();
  try {
    const result = await createAgentToken({ actorId, agentId: idSchema.parse(agentId), name: tokenNameSchema.parse(name) });
    refreshTeams();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The token could not be created. Please try again.") };
  }
}

/** Revokes one of an agent's tokens. */
export async function revokeAgentTokenAction(agentId: string, tokenId: string): Promise<ActionResult<null>> {
  const actorId = await requireUserId();
  try {
    await revokeAgentToken({ actorId, agentId: idSchema.parse(agentId), tokenId: idSchema.parse(tokenId) });
    refreshTeams();
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error, "The token could not be revoked. Please try again.") };
  }
}
