import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, mention, user, type ArtifactRecord } from "@/db/schema";
import { getViewableArtifact } from "@/lib/access";
import type { Actor } from "@/lib/agents/identity";
import { loadActors } from "@/lib/agents/queries";
import { afterResponse } from "@/lib/notifications/after-response";
import { documentMentionNotifications } from "@/lib/notifications/create";

import { MAX_DOCUMENT_HANDLES, MAX_MENTIONS_PER_SAVE } from "./config";
import { alreadyNotified, emailPeople, mentionCandidates } from "./delivery";
import { addedMentions, documentMentionStep } from "./document-mention-rules";
import { parseMentions } from "./mentions";
import { mentionRefusal, type MentionCandidate } from "./rules";
import { threadMutedAgentIds } from "./thread";

/**
 * Mentions in a document's own text: `@handle` in a Markdown artifact
 * notifies that teammate or agent, as a comment's mention does. A save
 * decides it (document-mention-rules.ts), after its response. The same
 * people and agents can be reached as from a comment (rules.ts), except that
 * the artifact's comments setting does not matter, and an agent's save
 * notifies people only: two agents can never ping each other through a
 * document with no person in between.
 *
 * The stored row holds ids only. What the mention says is read from the text
 * the recipient is served when they list their inbox, so a recipient who is
 * served an approved version never learns of a mention that waits in a newer
 * one, and a mention taken out of the text drops out of every list.
 */

/** A save of a document: the row it changed and the row it wrote. */
export interface DocumentSave {
  before: Pick<ArtifactRecord, "content" | "kind"> | null;
  after: ArtifactRecord;
  editorId: string;
}

/** A candidate a mention reaches: a real user or agent, not the writer. */
type Reachable = MentionCandidate & { userId: string };

function isReachable(candidate: MentionCandidate, writer: Actor): candidate is Reachable {
  // An agent's save never notifies agents: the comment rule's loop limit, at its strictest.
  return candidate.userId !== null && candidate.userId !== writer.userId && mentionRefusal(candidate, writer.kind === "agent") === null;
}

/** Whether each stored document mention of these recipients on this artifact was read. */
async function storedMentions(artifactId: string, recipientIds: string[]): Promise<Map<string, { read: boolean }>> {
  const rows = await getDb()
    .select({ recipientId: mention.recipientId, readAt: mention.readAt })
    .from(mention)
    .where(and(eq(mention.artifactId, artifactId), isNull(mention.commentId), inArray(mention.recipientId, recipientIds)));
  return new Map(rows.map((row) => [row.recipientId, { read: row.readAt !== null }]));
}

/**
 * Whether this save has nobody to tell, from one query: every handle the
 * text names already has a stored mention, and none was added anew after its
 * earlier one was read. The common case for an autosave of a document that
 * mentions people, so it stops here before any other lookup. A handle that
 * reaches nobody (unknown, the writer's own) never has a row, so such a
 * document takes the full path each time.
 */
async function nothingDue(save: DocumentSave, handles: readonly string[]): Promise<boolean> {
  const rows = await getDb()
    .select({ handle: user.username, readAt: mention.readAt })
    .from(mention)
    .innerJoin(user, eq(user.id, mention.recipientId))
    .where(and(eq(mention.artifactId, save.after.id), isNull(mention.commentId)));
  const stored = new Map(rows.flatMap((row) => (row.handle ? [[row.handle, { read: row.readAt !== null }] as const] : [])));
  const added = addedOf(save);
  return handles.every((handle) => {
    const known = stored.get(handle);
    return known !== undefined && documentMentionStep({ stored: known, added: added.has(handle) }) === "keep";
  });
}

/** The handles this save added. Text that was not Markdown before counts as none. */
function addedOf(save: DocumentSave): Set<string> {
  return addedMentions(save.before?.kind === "markdown" ? save.before.content : null, save.after.content);
}

/** Whether the text this recipient is served names them: someone served an approved version is not told of a newer one's mention. */
async function servedTheMention(publicId: string, candidate: Reachable): Promise<boolean> {
  const viewable = await getViewableArtifact(publicId, candidate.userId);
  return viewable?.view.kind === "markdown" && parseMentions(viewable.view.content).includes(candidate.handle);
}

/** The reachable people and agents this save should tell, at most MAX_MENTIONS_PER_SAVE. */
async function dueMentions(save: DocumentSave, writer: Actor, threadMutes: ReadonlySet<string>): Promise<Reachable[]> {
  const { after } = save;
  const handles = parseMentions(after.content).slice(0, MAX_DOCUMENT_HANDLES);
  const candidates = await mentionCandidates(handles, after, writer.userId, threadMutes, "document");
  const reachable = candidates.filter((candidate) => isReachable(candidate, writer));
  if (reachable.length === 0) return [];
  const stored = await storedMentions(after.id, reachable.map((candidate) => candidate.userId));
  const added = addedOf(save);
  const due = reachable.filter((candidate) => documentMentionStep({ stored: stored.get(candidate.userId) ?? null, added: added.has(candidate.handle) }) !== "keep").slice(0, MAX_MENTIONS_PER_SAVE);
  const served = await Promise.all(due.map((candidate) => servedTheMention(after.publicId, candidate)));
  return due.filter((_, index) => served[index]);
}

/** Stores one inbox row per recipient, or refreshes the one they have, and returns the rows. */
async function storeMentions(artifactId: string, writerId: string, recipients: readonly Reachable[]) {
  const rows = recipients.map((candidate) => ({ id: randomUUID(), commentId: null, artifactId, recipientId: candidate.userId, actorId: writerId }));
  return getDb()
    .insert(mention)
    .values(rows)
    .onConflictDoUpdate({
      target: [mention.artifactId, mention.recipientId],
      targetWhere: sql`${mention.commentId} is null`,
      set: { createdAt: sql`now()`, readAt: null, actorId: sql`excluded.actor_id` },
    })
    .returning();
}

/**
 * Notifies the people and agents a saved document newly mentions: an inbox
 * row for each (people and agents), then the bell, the browser, and an email
 * for people, each by their settings. Nothing for a format other than
 * Markdown, or from an agent that is muted.
 */
export async function deliverDocumentMentions(save: DocumentSave): Promise<void> {
  const { after } = save;
  if (after.kind !== "markdown" || !after.content.includes("@")) return;
  const handles = parseMentions(after.content).slice(0, MAX_DOCUMENT_HANDLES);
  if (handles.length === 0 || (await nothingDue(save, handles))) return;
  const [actors, threadMutes] = await Promise.all([loadActors([save.editorId]), threadMutedAgentIds(after.id)]);
  const writer = actors.get(save.editorId);
  if (!writer) return;
  // A muted agent notifies nobody, as in a thread.
  if (writer.kind === "agent" && (writer.teamMuted || threadMutes.has(writer.userId))) return;
  const due = await dueMentions(save, writer, threadMutes);
  if (due.length === 0) return;
  const people = due.filter((candidate) => candidate.kind === "person").map((candidate) => candidate.userId);
  // Someone with an unread mention on this artifact already had its email.
  const quiet = await alreadyNotified(after.id, people);
  const stored = await storeMentions(after.id, writer.userId, due);
  // A refreshed row keeps its id, so the email's idempotency key carries the time of this mention too.
  const toEmail = stored.filter((row) => people.includes(row.recipientId) && !quiet.has(row.recipientId)).map((row) => ({ id: row.recipientId, mentionId: `${row.id}:${String(row.createdAt.getTime())}` }));
  await Promise.all([
    emailPeople({ people: toEmail, artifact: after, writer }),
    documentMentionNotifications({ artifact: after, writerId: writer.userId, people }),
  ]);
}

/** Notifies a saved document's new mentions after the response, so a save never waits on it or fails because of it. */
export function notifyDocumentMentions(save: DocumentSave): void {
  if (save.after.kind !== "markdown" || !save.after.content.includes("@")) return;
  afterResponse("Document mentions", () => deliverDocumentMentions(save));
}

/**
 * After a sharing change: the people and agents the text already names who
 * can read it now are told, as if whoever saved it last had just saved it.
 * Nothing in the text is new, so nobody already told hears again.
 */
export async function deliverDocumentMentionsAfterSharing(artifactId: string): Promise<void> {
  const [row] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  if (row) await deliverDocumentMentions({ before: row, after: row, editorId: row.updatedBy ?? row.userId });
}

/** deliverDocumentMentionsAfterSharing, after the response. */
export function notifyDocumentMentionsAfterSharing(artifactId: string): void {
  afterResponse("Document mentions after sharing", () => deliverDocumentMentionsAfterSharing(artifactId));
}
