import type { SharingRequestStatus } from "@/lib/artifact-types";

import { wants, type NotificationPreferences } from "./preference-rules";
import { isCommentType, type NotificationChannel, type NotificationType } from "./types";

/**
 * Pure decisions about who gets a notification. create.ts gathers the facts
 * (with the one access check) and applies these rules. People only: agents
 * keep their MCP inbox, and a notification about an agent's artifact or
 * request goes to the person who added the agent.
 */

/** Someone involved: a person, or an agent with the person who added it. */
export interface Party {
  userId: string;
  kind: "person" | "agent";
  /** For agents: the person who added it. Null when that person is gone. */
  ownerId: string | null;
}

/** One notification to store: who gets it, and what kind. */
export interface NotificationDraft {
  recipientId: string;
  type: NotificationType;
}

/** The person who hears about a party's work: the person, or whoever added the agent. */
export function personFor(party: Party | null): string | null {
  if (!party) return null;
  return party.kind === "person" ? party.userId : party.ownerId;
}

/** The facts about a new comment that decide who hears about it. */
export interface CommentFacts {
  writerId: string;
  /** The writer is an agent muted by its team or in this thread. Muted agents notify nobody. */
  writerMuted: boolean;
  /** Who wrote the artifact. Null when the account is gone. */
  artifactAuthor: Party | null;
  /** Who wrote the comment this one replies to. Null for a top-level comment or a gone author. */
  parentAuthor: Party | null;
  /** People (never agents) whose mention of this comment landed (src/lib/comments/rules.ts). */
  mentionedPeople: readonly string[];
}

/**
 * Who hears about a new comment, one notification each, the most direct kind
 * first: a mention, then a reply to their comment, then a comment on an
 * artifact they (or an agent they added) wrote. The writer never hears about
 * their own comment. Replies to an agent's comment reach nobody here; the
 * agent sees them over MCP.
 */
export function commentRecipients(facts: CommentFacts): NotificationDraft[] {
  if (facts.writerMuted) return [];
  const drafts: NotificationDraft[] = [];
  const seen = new Set<string>([facts.writerId]);
  const add = (recipientId: string | null, type: NotificationType) => {
    if (!recipientId || seen.has(recipientId)) return;
    seen.add(recipientId);
    drafts.push({ recipientId, type });
  };
  for (const id of facts.mentionedPeople) add(id, "mention");
  if (facts.parentAuthor?.kind === "person") add(facts.parentAuthor.userId, "reply");
  add(personFor(facts.artifactAuthor), "comment");
  return drafts;
}

/** A member of the request's team who may decide it. */
export interface TeamManager {
  userId: string;
  isAgent: boolean;
}

/**
 * Who hears that a request waits for approval: the team's owners and admins
 * who are people, never the requester (or the person whose agent asked).
 */
export function shareRequestRecipients(input: { requester: Party; managers: readonly TeamManager[] }): NotificationDraft[] {
  const skip = new Set([input.requester.userId, personFor(input.requester)]);
  const recipients = input.managers.filter((manager) => !manager.isAgent && !skip.has(manager.userId)).map((manager) => manager.userId);
  return [...new Set(recipients)].map((recipientId) => ({ recipientId, type: "share_request" }));
}

/**
 * Who hears that a request was decided: the requester, or the person who
 * added the agent that asked. Nobody for a request still open or canceled,
 * and never the person who decided it.
 */
export function shareDecisionRecipient(input: { status: SharingRequestStatus; requester: Party | null; deciderId: string }): NotificationDraft | null {
  if (input.status !== "approved" && input.status !== "denied") return null;
  const recipientId = personFor(input.requester);
  if (!recipientId || recipientId === input.deciderId) return null;
  return { recipientId, type: input.status === "approved" ? "share_approved" : "share_declined" };
}

/** What a recipient may see right now. */
export interface RecipientAccess {
  /** The one access check lets them read the artifact. */
  canRead: boolean;
  /** The comments setting lets them see its comments. */
  seesComments: boolean;
  /** They are an owner or admin of the request's team. */
  managesRequestTeam: boolean;
}

/**
 * Whether a person may get, or still see, a notification. Comment kinds need
 * the artifact and its comments; a waiting request needs the team role that
 * decides it (the team page shows the same request); a decision needs the
 * artifact. Someone who lost access gets nothing, not even the title.
 */
export function mayNotify(type: NotificationType, access: RecipientAccess): boolean {
  if (isCommentType(type)) return access.canRead && access.seesComments;
  if (type === "share_request") return access.managesRequestTeam;
  return access.canRead;
}

/** The drafts that reach a channel: the recipient may see it now and wants it there. */
export function draftsFor(
  drafts: readonly NotificationDraft[],
  channel: NotificationChannel,
  facts: { access: (recipientId: string) => RecipientAccess; preferences: (recipientId: string) => NotificationPreferences },
): NotificationDraft[] {
  return drafts.filter((draft) => mayNotify(draft.type, facts.access(draft.recipientId)) && wants(facts.preferences(draft.recipientId), draft.type, channel));
}
