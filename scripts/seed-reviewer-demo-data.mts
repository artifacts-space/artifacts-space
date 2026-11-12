/**
 * The database side of scripts/seed-reviewer-demo.mts: it removes and creates
 * a reviewer account's demo data through the app's own services, so search,
 * history, bylines, sharing, comments, and the inbox behave as in the product.
 * See the script's header for what a reset removes.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { Pool } from "pg";

import { getDb } from "@/db";
import { notification } from "@/db/notification-schema";
import { account, artifact, mention, user } from "@/db/schema";
import { authoredByViewerCondition } from "@/lib/agents/owner-access";
import { createArtifact, deleteArtifact, updateArtifact } from "@/lib/artifacts";
import { credentialProviderId } from "@/lib/auth/password-sign-in-rules";
import { isReviewerDomainEmail } from "@/lib/auth/reviewer-domains";
import { createComment } from "@/lib/comments/service";
import { notificationEvents } from "@/lib/notifications/types";
import { defaultPreferences, type NotificationPreferences } from "@/lib/notifications/preference-rules";
import { savePreferences } from "@/lib/notifications/preferences";
import { deleteProject } from "@/lib/projects/manage";
import { listScopeProjects } from "@/lib/projects/queries";
import { requestArtifactSharing } from "@/lib/sharing/service";
import { findPersonalTeam } from "@/lib/teams/queries";

import { sampleArtifacts } from "./create-reviewer-account-rules.mts";
import {
  apiSpec,
  apiSpecComment,
  inboxRefusal,
  launchProject,
  launchTimeline,
  leftoverRefusal,
  onboardingArtifacts,
  otherArtifactCount,
  partlySeededRefusal,
  releaseChecklist,
  roadmapSummary,
  roadmapTitle,
  roadmapVersions,
  seededTitles,
  type DemoArtifact,
  type RemovalPlan,
  type SeedCounts,
  type SeedRequest,
} from "./seed-reviewer-demo-rules.mts";

/** A user-facing stop: printed as is, with no stack. */
export class ReviewerDemoRefusal extends Error {}

/** A reviewer account: a person with a password login from reviewer:create. */
interface ReviewerAccount {
  id: string;
  username: string;
}

/** What a run did. `previewed` is true when a reset only said what it would remove. */
export interface SeedOutcome {
  counts: SeedCounts;
  alreadySeeded: boolean;
  previewed: boolean;
}

/**
 * What the caller decides for a run. `allowTestDomain` is the database's
 * answer (reviewerDatabase): the reserved test domain counts as a reviewer
 * domain only on a database on this machine. `onRemoving` runs once, before a
 * reset deletes anything.
 */
export interface SeedOptions {
  allowTestDomain: boolean;
  onRemoving?: (plan: RemovalPlan) => void;
}

/**
 * The account behind this address when it is a reviewer account, or a
 * refusal. Two gates, here beside the deletes that need them and not only in
 * the command: the address is under a reviewer domain, and the account has
 * the password login that only reviewer:create gives.
 */
async function reviewerAccount(email: string, role: "reviewer" | "commenter", allowTestDomain: boolean): Promise<ReviewerAccount> {
  const who = role === "reviewer" ? "--email" : "--commenter-email";
  if (!isReviewerDomainEmail(email, allowTestDomain)) throw new ReviewerDemoRefusal(`${who} is not under a reviewer domain, so the script does not touch it.`);
  const [row] = await getDb()
    .select({ id: user.id, username: user.username })
    .from(user)
    .innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, credentialProviderId), eq(account.accountId, user.id)))
    .where(eq(sql`lower(${user.email})`, email))
    .limit(1);
  if (!row) throw new ReviewerDemoRefusal(`${who} does not name a reviewer account. The script only touches accounts made with reviewer:create (they have a password login).`);
  if (!row.username) throw new ReviewerDemoRefusal(`${who} names a reviewer account without a username, so it cannot be mentioned.`);
  return { id: row.id, username: row.username };
}

/**
 * The artifacts a reset removes: the reviewer's own, and those of agents they
 * added in a team they still belong to. It is the app's own author scope
 * (authoredByViewerCondition), so it lists exactly what deleteArtifact allows.
 */
async function ownedArtifacts(userId: string): Promise<{ id: string; title: string }[]> {
  return getDb().select({ id: artifact.id, title: artifact.title }).from(artifact).where(authoredByViewerCondition(getDb(), userId));
}

/**
 * A reset removes everything the account owns, not only the demo rows: the
 * account exists only for a directory review, and the test prompts create and
 * change artifacts of their own. It is deliberate and has no prompt (the
 * script runs unattended); the gates are that both addresses are under a
 * reviewer domain and have the password login only reviewer:create gives.
 * `onRemoving` gets the plan before anything goes, with how many artifacts
 * are not demo data, and a preview stops there.
 *
 * It removes the reviewer's artifacts through deleteArtifact (files included;
 * the foreign keys cascade to versions, comments and replies, mentions,
 * notifications, sharing requests, views, mutes, and edit leases), then their
 * own projects, then the inbox entries and notifications still left for them
 * (nothing refers to either). Artifacts go first, so a run that stops because
 * deleteArtifact refused one has not yet touched the inbox; seeding on top of
 * leftovers would hide them, so it stops.
 */
async function removeDemoState(userId: string, counts: SeedCounts, request: SeedRequest, options: SeedOptions): Promise<void> {
  const [artifacts, projects] = await Promise.all([ownedArtifacts(userId), listScopeProjects({ kind: "user", userId })]);
  options.onRemoving?.({ artifacts: artifacts.length, otherArtifacts: otherArtifactCount(artifacts.map((item) => item.title)), projects: projects.length });
  if (request.preview) return;
  // Counted first: most of these rows go with their artifact, and the report should still say how many there were.
  const [inbox, notifications] = await Promise.all([
    getDb().select({ id: mention.id }).from(mention).where(eq(mention.recipientId, userId)),
    getDb().select({ id: notification.id }).from(notification).where(eq(notification.recipientId, userId)),
  ]);
  for (const item of artifacts) {
    if (!(await deleteArtifact(userId, item.id))) throw new ReviewerDemoRefusal(leftoverRefusal(counts.removedArtifacts, artifacts.length));
    counts.removedArtifacts += 1;
  }
  for (const project of projects) {
    await deleteProject(userId, project.id);
    counts.removedProjects += 1;
  }
  await getDb().delete(mention).where(eq(mention.recipientId, userId));
  await getDb().delete(notification).where(eq(notification.recipientId, userId));
  counts.removedInboxEntries += inbox.length;
  counts.removedNotifications += notifications.length;
}

/** The titles of the reviewer's own artifacts. */
async function ownTitles(userId: string): Promise<Set<string>> {
  const rows = await getDb().select({ title: artifact.title }).from(artifact).where(eq(artifact.userId, userId));
  return new Set(rows.map((row) => row.title));
}

/**
 * The reviewer's notification settings with every email and browser
 * notification off and the in-app bell on. Mentions are the only event that
 * emails (src/lib/comments/delivery.ts reads this before it sends), and push
 * goes only to events with browser on, so nothing in the seed, or in a
 * review that replies to the seeded comment, sends an email or a push.
 */
export function quietPreferences(): NotificationPreferences {
  const preferences = defaultPreferences();
  for (const event of notificationEvents) preferences[event] = { ...preferences[event], browser: false, email: false };
  return preferences;
}

async function createPlain(userId: string, item: DemoArtifact & { kind?: "markdown" | "csv" }, counts: SeedCounts, project: string | null = null) {
  const created = await createArtifact(userId, { title: item.title, summary: item.summary, content: item.content, kind: item.kind ?? "markdown", project });
  counts.createdArtifacts += 1;
  return created;
}

/** Q4 roadmap: created, then saved twice more as separate web editing sessions, so History shows three versions. */
async function createRoadmap(userId: string, counts: SeedCounts) {
  const [first, ...later] = roadmapVersions;
  const created = await createPlain(userId, { title: roadmapTitle, summary: roadmapSummary, content: first ?? "" }, counts);
  for (const content of later) {
    const saved = await updateArtifact(userId, created.id, { content }, "person", { session: "start" });
    if (!saved) throw new Error("The roadmap could not be saved.");
    counts.createdVersions += 1;
  }
}

/**
 * API spec: shared by link with comments open to anyone signed in, which the
 * product applies at once for an artifact in the author's personal team (no
 * approval, sharing/rules.ts). The other reviewer can then read it and
 * comment, and their mention of the reviewer lands in the reviewer's inbox.
 */
async function createApiSpec(reviewer: ReviewerAccount, commenter: ReviewerAccount, counts: SeedCounts) {
  const created = await createPlain(reviewer.id, apiSpec, counts);
  const personal = await findPersonalTeam(reviewer.id);
  if (!personal) throw new ReviewerDemoRefusal("The reviewer account has no personal team.");
  const shared = await requestArtifactSharing({ requesterId: reviewer.id, artifactId: created.id, visibility: "link", teamId: personal.id, comments: "signed_in", actor: "person" });
  if (shared.status !== "applied") throw new Error("Sharing the API spec waited for approval.");
  const posted = await createComment({ actorId: commenter.id, publicId: created.publicId, body: apiSpecComment(reviewer.username) });
  counts.createdComments += 1;
  if (!posted.mentions.notified.some((item) => item.handle === reviewer.username)) throw new Error("The comment's mention did not reach the reviewer's inbox.");
}

async function createDemoState(reviewer: ReviewerAccount, commenter: ReviewerAccount, counts: SeedCounts) {
  // The sample artifacts reviewer:create makes, put back after a reset.
  const titles = await ownTitles(reviewer.id);
  for (const sample of sampleArtifacts) if (!titles.has(sample.title)) await createPlain(reviewer.id, sample, counts);
  await createPlain(reviewer.id, launchTimeline, counts, launchProject);
  // Oldest first: save times come from the database clock, so the last one created is the newest.
  for (const item of onboardingArtifacts) await createPlain(reviewer.id, item, counts);
  await createPlain(reviewer.id, releaseChecklist, counts);
  await createRoadmap(reviewer.id, counts);
  await createApiSpec(reviewer, commenter, counts);
}

/**
 * Checks, once the services' background work has finished, that the seed
 * landed where the test cases look: one unread inbox entry for the reviewer,
 * on their API spec. The notification work logs its failures and never
 * throws, so a seed that left the inbox empty would otherwise look done.
 */
export async function assertSeedLanded(request: SeedRequest, options: SeedOptions): Promise<void> {
  const reviewer = await reviewerAccount(request.email, "reviewer", options.allowTestDomain);
  const waiting = await getDb()
    .select({ id: mention.id })
    .from(mention)
    .innerJoin(artifact, eq(artifact.id, mention.artifactId))
    .where(and(eq(mention.recipientId, reviewer.id), isNull(mention.readAt), eq(artifact.userId, reviewer.id), eq(artifact.title, apiSpec.title)));
  if (waiting.length !== 1) throw new ReviewerDemoRefusal(inboxRefusal(waiting.length));
}

/** Closes the app's database pool so the script can exit. Neon's HTTP driver holds no connection to close. */
export async function closeDatabase(): Promise<void> {
  const client: unknown = getDb().$client;
  if (client instanceof Pool) await client.end();
}

/** No counts yet. */
export function zeroCounts(): SeedCounts {
  return { removedArtifacts: 0, removedProjects: 0, removedInboxEntries: 0, removedNotifications: 0, createdArtifacts: 0, createdVersions: 0, createdComments: 0 };
}

/**
 * Seeds the reviewer account's demo data, or with `reset` removes the
 * account's state first and seeds it again; with `preview` too it only hands
 * the plan to `onRemoving` and changes nothing. Without `reset`, an account
 * that already holds every demo title is left as it is. Both addresses must be
 * reviewer accounts. Throws a ReviewerDemoRefusal (safe to print) when the
 * request is refused: an account that is not a reviewer account, an artifact
 * a reset could not remove, or an account that holds only some of the demo
 * titles. Background work the services schedule (the comment's
 * notifications) is the caller's to wait for; assertSeedLanded then checks it.
 */
export async function seedReviewerDemo(request: SeedRequest, options: SeedOptions): Promise<SeedOutcome> {
  const [reviewer, commenter] = await Promise.all([reviewerAccount(request.email, "reviewer", options.allowTestDomain), reviewerAccount(request.commenterEmail, "commenter", options.allowTestDomain)]);
  if (reviewer.id === commenter.id) throw new ReviewerDemoRefusal("The commenter must be another reviewer account, not the same one.");
  const counts = zeroCounts();
  if (request.reset) await removeDemoState(reviewer.id, counts, request, options);
  if (request.preview) return { counts, alreadySeeded: false, previewed: true };
  const held = seededTitles(await ownTitles(reviewer.id));
  if (held.state === "all") return { counts, alreadySeeded: true, previewed: false };
  if (held.state === "some") throw new ReviewerDemoRefusal(partlySeededRefusal(held.has, held.missing));
  // Before anything that notifies: the reviewer gets the comment's mention in the app only.
  await savePreferences(reviewer.id, quietPreferences());
  await createDemoState(reviewer, commenter, counts);
  return { counts, alreadySeeded: false, previewed: false };
}
