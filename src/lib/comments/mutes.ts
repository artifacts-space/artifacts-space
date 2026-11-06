import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { agent, threadMute, user } from "@/db/schema";
import { listTeamIdsForUser } from "@/lib/teams/queries";
import { UserFacingError } from "@/lib/user-facing-error";

import { canMuteInThread } from "./rules";
import { requireThread, type Thread } from "./thread";

/** An agent in a thread, with whether it is muted there and whether the viewer may change that. */
export interface ThreadAgentView {
  userId: string;
  handle: string;
  muted: boolean;
  teamMuted: boolean;
  canMute: boolean;
}

/**
 * Agents the viewer may see mute controls for: those that commented in the
 * thread or are already muted there. `authorIds` are the thread's comment authors.
 */
export async function listThreadAgents(thread: Thread, authorIds: string[]): Promise<ThreadAgentView[]> {
  const mutedRows = await getDb().select({ agentId: threadMute.agentId }).from(threadMute).where(eq(threadMute.artifactId, thread.artifact.id));
  const muted = new Set(mutedRows.map((row) => row.agentId));
  const ids = [...new Set([...authorIds, ...muted])];
  if (ids.length === 0) return [];
  const [rows, viewerTeams] = await Promise.all([
    getDb()
      .select({ userId: agent.userId, teamId: agent.teamId, mutedAt: agent.mutedAt, handle: user.username })
      .from(agent)
      .innerJoin(user, eq(user.id, agent.userId))
      .where(inArray(agent.userId, ids)),
    listTeamIdsForUser(thread.actor.userId),
  ]);
  return rows.map((row) => ({
    userId: row.userId,
    handle: row.handle ?? "",
    muted: muted.has(row.userId),
    teamMuted: row.mutedAt !== null,
    canMute: canMuteInThread({ viewerKind: thread.actor.kind, isArtifactAuthor: thread.artifact.userId === thread.actor.userId, inAgentTeam: viewerTeams.has(row.teamId) }),
  }));
}

async function agentByHandle(handle: string) {
  const cleaned = handle.trim().toLowerCase().replace(/^@/, "");
  const [row] = await getDb()
    .select({ userId: agent.userId, teamId: agent.teamId })
    .from(agent)
    .innerJoin(user, eq(user.id, agent.userId))
    .where(eq(user.username, cleaned))
    .limit(1);
  return row ?? null;
}

/**
 * Mutes or unmutes an agent in one artifact's thread. Only people may do this:
 * the artifact's author, or a member of the agent's team. A muted agent gets
 * no inbox entries from the thread and cannot post in it.
 */
export async function setThreadMute(input: { actorId: string; publicId: string; agentHandle: string; muted: boolean }) {
  const thread = await requireThread(input.actorId, input.publicId);
  const target = await agentByHandle(input.agentHandle);
  if (!target) throw new UserFacingError("Agent not found.");
  const viewerTeams = await listTeamIdsForUser(input.actorId);
  const allowed = canMuteInThread({
    viewerKind: thread.actor.kind,
    isArtifactAuthor: thread.artifact.userId === input.actorId,
    inAgentTeam: viewerTeams.has(target.teamId),
  });
  if (!allowed) throw new UserFacingError("Only the artifact's author or the agent's teammates can mute it here.");
  if (input.muted) {
    await getDb().insert(threadMute).values({ artifactId: thread.artifact.id, agentId: target.userId, mutedBy: input.actorId }).onConflictDoNothing();
    return;
  }
  await getDb().delete(threadMute).where(and(eq(threadMute.artifactId, thread.artifact.id), eq(threadMute.agentId, target.userId)));
}
