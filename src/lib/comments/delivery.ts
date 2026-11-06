import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { mention, teamMember, user } from "@/db/schema";
import type { ArtifactMetaRecord } from "@/lib/artifact-columns";
import { getArtifactAccess } from "@/lib/access";
import { canViewArtifact } from "@/lib/access-rules";
import type { Actor } from "@/lib/agents/identity";
import { loadActors } from "@/lib/agents/queries";

import { sendMentionEmail } from "./mention-email";
import { parseMentions } from "./mentions";
import { decideMentions, type MentionCandidate, type MentionDecision } from "./rules";
import { toAuthorView } from "./views";

/** What happened to the mentions in a comment, for the writer. */
export interface MentionOutcome {
  notified: { handle: string; kind: "person" | "agent" }[];
  refused: MentionDecision["refused"];
}

async function teamsByUser(userIds: string[]) {
  const byUser = new Map<string, Set<string>>();
  if (userIds.length === 0) return byUser;
  const rows = await getDb().select({ userId: teamMember.userId, teamId: teamMember.teamId }).from(teamMember).where(inArray(teamMember.userId, userIds));
  for (const row of rows) {
    const set = byUser.get(row.userId) ?? new Set<string>();
    set.add(row.teamId);
    byUser.set(row.userId, set);
  }
  return byUser;
}

function sharesTeam(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  for (const id of a) if (b.has(id)) return true;
  return false;
}

function unknownHandle(handle: string): MentionCandidate {
  return { handle, userId: null, kind: "person", canView: false, isArtifactAuthor: false, sharesTeamWithWriter: false, muted: false };
}

/**
 * The facts the mention rule needs for known users: people with a handle, and
 * agents still in their team. Visibility uses the same read rule as every
 * other path (canViewArtifact), with each user's own team memberships.
 */
export async function mentionFacts(userIds: string[], artifact: ArtifactMetaRecord, writerId: string, threadMutes: ReadonlySet<string>): Promise<MentionCandidate[]> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return [];
  const [actors, teams] = await Promise.all([loadActors(ids), teamsByUser([...ids, writerId])]);
  const writerTeams = teams.get(writerId) ?? new Set<string>();
  const facts: MentionCandidate[] = [];
  for (const actor of actors.values()) {
    if (!actor.handle) continue;
    const memberOf = teams.get(actor.userId) ?? new Set<string>();
    const isTeamMember = artifact.teamId !== null && memberOf.has(artifact.teamId);
    facts.push({
      handle: actor.handle,
      userId: actor.userId,
      kind: actor.kind,
      canView: canViewArtifact(artifact, { userId: actor.userId, isTeamMember }),
      isArtifactAuthor: artifact.userId === actor.userId,
      sharesTeamWithWriter: sharesTeam(memberOf, writerTeams),
      muted: actor.kind === "agent" && (actor.teamMuted || threadMutes.has(actor.userId)),
    });
  }
  return facts;
}

/** The mention facts for each handle in a comment. Unknown handles get facts that refuse them. */
async function mentionCandidates(handles: string[], artifact: ArtifactMetaRecord, writerId: string, threadMutes: ReadonlySet<string>): Promise<MentionCandidate[]> {
  const users = await getDb().select({ id: user.id }).from(user).where(inArray(user.username, handles));
  const facts = await mentionFacts(users.map((row) => row.id), artifact, writerId, threadMutes);
  const byHandle = new Map(facts.map((fact) => [fact.handle, fact]));
  return handles.map((handle) => byHandle.get(handle) ?? unknownHandle(handle));
}

/** People who already had an unread mention on this artifact. They get no second email. */
async function alreadyNotified(artifactId: string, recipientIds: string[]) {
  if (recipientIds.length === 0) return new Set<string>();
  const rows = await getDb()
    .select({ recipientId: mention.recipientId })
    .from(mention)
    .where(and(eq(mention.artifactId, artifactId), inArray(mention.recipientId, recipientIds), isNull(mention.readAt)));
  return new Set(rows.map((row) => row.recipientId));
}

async function emailPeople(input: { people: { id: string; mentionId: string }[]; artifact: ArtifactMetaRecord; commentId: string; writer: Actor }) {
  if (input.people.length === 0) return;
  const rows = await getDb().select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, input.people.map((person) => person.id)));
  const emails = new Map(rows.map((row) => [row.id, row.email]));
  const authorLabel = toAuthorView(input.writer).label;
  const results = await Promise.allSettled(
    input.people.map(async (person) => {
      // The title this person may read: readers outside the team see the approved version's.
      const viewable = await getArtifactAccess(input.artifact.publicId, person.id);
      if (!viewable) return;
      await sendMentionEmail({
        mentionId: person.mentionId,
        email: emails.get(person.id) ?? "",
        authorLabel,
        artifactTitle: viewable.served.title,
        publicId: input.artifact.publicId,
        commentId: input.commentId,
      });
    }),
  );
  if (results.some((result) => result.status === "rejected")) console.error("[comments] A mention email failed.");
}

/** Stores inbox entries for the mentions that landed, and emails the people among them. */
async function deliver(decision: MentionDecision, input: { artifact: ArtifactMetaRecord; commentId: string; writer: Actor }) {
  if (decision.deliver.length === 0) return;
  const people = decision.deliver.filter((item) => item.kind === "person").map((item) => item.userId);
  const quiet = await alreadyNotified(input.artifact.id, people);
  const rows = decision.deliver.map((item) => ({ id: randomUUID(), commentId: input.commentId, artifactId: input.artifact.id, recipientId: item.userId }));
  const inserted = await getDb().insert(mention).values(rows).onConflictDoNothing().returning();
  const toEmail = inserted.filter((row) => people.includes(row.recipientId) && !quiet.has(row.recipientId)).map((row) => ({ id: row.recipientId, mentionId: row.id }));
  await emailPeople({ people: toEmail, artifact: input.artifact, commentId: input.commentId, writer: input.writer });
}

/**
 * Parses the mentions in a comment, decides which land, stores inbox entries,
 * and emails mentioned people. `skipHandles` are handles this comment already
 * notified (on edit). Returns what the writer should be told.
 */
export async function processMentions(input: {
  body: string;
  artifact: ArtifactMetaRecord;
  commentId: string;
  writer: Actor;
  loopLimited: boolean;
  threadMutes: ReadonlySet<string>;
  skipHandles?: ReadonlySet<string>;
}): Promise<MentionOutcome> {
  const handles = parseMentions(input.body).filter((handle) => !input.skipHandles?.has(handle));
  if (handles.length === 0) return { notified: [], refused: [] };
  const candidates = await mentionCandidates(handles, input.artifact, input.writer.userId, input.threadMutes);
  const decision = decideMentions({ writerId: input.writer.userId, candidates, loopLimited: input.loopLimited });
  await deliver(decision, { artifact: input.artifact, commentId: input.commentId, writer: input.writer });
  return { notified: decision.deliver.map(({ handle, kind }) => ({ handle, kind })), refused: decision.refused };
}

/** Handles this comment already notified, so an edit does not notify them twice. */
export async function notifiedHandles(commentId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ username: user.username })
    .from(mention)
    .innerJoin(user, eq(user.id, mention.recipientId))
    .where(eq(mention.commentId, commentId));
  return new Set(rows.flatMap((row) => (row.username ? [row.username] : [])));
}
