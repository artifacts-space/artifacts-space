import { AGENT_LOOP_LIMIT, MAX_MENTIONS_PER_COMMENT } from "./config";

/**
 * Pure decisions for comment threads: who may read, write, edit, or delete,
 * which mentions land, the agent loop limit, mutes, and rate limits. The
 * service in service.ts gathers the facts and applies these rules.
 */

/** Who wrote something: a person, or an agent teammate. */
export type AuthorKind = "person" | "agent";

/** Comments are for signed-in viewers who can view the artifact (the one access check decides that). */
export function canUseComments(input: { signedIn: boolean; canViewArtifact: boolean }): boolean {
  return input.signedIn && input.canViewArtifact;
}

/** Only the author edits or deletes a comment, and never once it is deleted. */
export function canChangeComment(comment: { authorId: string | null; deletedAt: Date | null }, viewerId: string): boolean {
  return comment.authorId !== null && comment.authorId === viewerId && comment.deletedAt === null;
}

/** An agent is muted for a thread when its team muted it, or someone muted it in this thread. */
export function isAgentMuted(input: { teamMuted: boolean; threadMuted: boolean }): boolean {
  return input.teamMuted || input.threadMuted;
}

/**
 * Who may mute or unmute an agent in one thread: a person (never an agent)
 * who is the artifact's author or belongs to the agent's team.
 */
export function canMuteInThread(input: { viewerKind: AuthorKind; isArtifactAuthor: boolean; inAgentTeam: boolean }): boolean {
  return input.viewerKind === "person" && (input.isArtifactAuthor || input.inAgentTeam);
}

/** How many comments at the end of the thread were written by agents, given authors newest first. */
export function agentStreak(authorKindsNewestFirst: readonly AuthorKind[]): number {
  let streak = 0;
  for (const kind of authorKindsNewestFirst) {
    if (kind !== "agent") break;
    streak += 1;
  }
  return streak;
}

/**
 * True when a new comment may not mention agents: an agent writes it, and the
 * thread already ends with `limit` agent comments in a row. A person posting
 * resets the streak.
 */
export function isLoopLimited(input: { writerKind: AuthorKind; streakBefore: number; limit?: number }): boolean {
  return input.writerKind === "agent" && input.streakBefore >= (input.limit ?? AGENT_LOOP_LIMIT);
}

/** Everything the mention rule needs to know about one mentioned handle. */
export interface MentionCandidate {
  handle: string;
  /** Null when no user or agent has this handle. */
  userId: string | null;
  kind: AuthorKind;
  /** The one access check says this user can view the artifact. */
  canView: boolean;
  isArtifactAuthor: boolean;
  /** The writer and this user share at least one team. */
  sharesTeamWithWriter: boolean;
  /** For agents: muted by its team or in this thread. */
  muted: boolean;
}

export type MentionRefusal = "not_visible" | "muted" | "loop_limit" | "too_many";

export interface MentionDecision {
  deliver: { handle: string; userId: string; kind: AuthorKind }[];
  refused: { handle: string; reason: MentionRefusal; message: string }[];
}

/** The notice the writer sees for a refused mention. Unknown handles read the same as hidden ones. */
export function refusalMessage(handle: string, reason: MentionRefusal): string {
  const who = `@${handle} was not notified.`;
  if (reason === "muted") return `${who} This agent is muted here.`;
  if (reason === "too_many") return `${who} Mention up to ${String(MAX_MENTIONS_PER_COMMENT)} people or agents in one comment.`;
  if (reason === "loop_limit") {
    return `${who} Agents posted ${String(AGENT_LOOP_LIMIT)} comments in a row in this thread. A person must post before agents can be mentioned again.`;
  }
  return `${who} You can mention the artifact's author and your teammates who can see this artifact.`;
}

/**
 * Why a mention would not land, or null when it would. The composer's
 * suggestions use this too, so they list only people and agents a mention reaches.
 */
export function mentionRefusal(candidate: MentionCandidate, loopLimited: boolean): MentionRefusal | null {
  const reachable = candidate.isArtifactAuthor || candidate.sharesTeamWithWriter;
  if (!candidate.userId || !candidate.canView || !reachable) return "not_visible";
  if (candidate.kind === "agent" && candidate.muted) return "muted";
  if (candidate.kind === "agent" && loopLimited) return "loop_limit";
  return null;
}

/**
 * Decides which mentions land. A mention lands when the mentioned user exists,
 * can view the artifact, and is its author or a teammate of the writer. Agents
 * must also not be muted, and agent-to-agent loops stop at the loop limit.
 * Mentioning yourself is ignored. Anything past the per-comment cap is refused.
 */
export function decideMentions(input: {
  writerId: string;
  candidates: readonly MentionCandidate[];
  loopLimited: boolean;
  max?: number;
}): MentionDecision {
  const max = input.max ?? MAX_MENTIONS_PER_COMMENT;
  const decision: MentionDecision = { deliver: [], refused: [] };
  const others = input.candidates.filter((candidate) => candidate.userId !== input.writerId);
  for (const [index, candidate] of others.entries()) {
    const reason = index >= max ? "too_many" : mentionRefusal(candidate, input.loopLimited);
    if (reason) {
      decision.refused.push({ handle: candidate.handle, reason, message: refusalMessage(candidate.handle, reason) });
    } else if (candidate.userId) {
      decision.deliver.push({ handle: candidate.handle, userId: candidate.userId, kind: candidate.kind });
    }
  }
  return decision;
}
