import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * The owner's demo-data script against a real Postgres. Two reviewer accounts
 * are made with reviewer:create's own function, one is seeded with the other
 * as commenter, and the directory's test prompts are then run through the MCP
 * tool handlers themselves (the real server and client over an in-memory
 * transport), acting as the reviewer. After the prompts' writes, --reset must
 * bring back the first seeded state exactly. Every test leaves the reviewer
 * at that state and with the seed's quiet settings, so they can be reordered. Email and push are spied on at
 * their boundaries (Sendir's send and the push sender), switched on, so a
 * send would be seen. Runs only when TEST_DATABASE_URL names a throwaway
 * local database with the migrations applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET ??= "db-test-only-secret-0123456789abcdef";
}

const boundary = vi.hoisted(() => ({ sendEmail: vi.fn(), sendPush: vi.fn(), afterTasks: [] as Promise<void>[], refuseDeletes: false }));
// The real deleteArtifact, which one test makes refuse, as it would when another change takes an artifact out of the account's reach mid-run.
vi.mock("@/lib/artifacts", async (importOriginal) => {
  const real = await importOriginal<{ deleteArtifact: (userId: string, id: string) => Promise<boolean> }>();
  return { ...real, deleteArtifact: (userId: string, id: string) => (boundary.refuseDeletes ? Promise.resolve(false) : real.deleteArtifact(userId, id)) };
});
vi.mock("@/lib/sendir", async (importOriginal) => ({ ...(await importOriginal<object>()), isSendirConfigured: () => true, sendEmail: boundary.sendEmail }));
vi.mock("@/lib/notifications/push/send", async (importOriginal) => ({ ...(await importOriginal<object>()), pushConfigured: () => true, sendPushMessages: boundary.sendPush }));
// Next's `after` has no request here: keep the notification work so the test can wait for it, as the script does.
vi.mock("@/lib/notifications/after-response", () => ({ afterResponse: (_label: string, task: () => Promise<void>) => { boundary.afterTasks.push(task()); } }));

/** Waits for the notification work the services handed to `after`. */
async function settle() {
  while (boundary.afterTasks.length > 0) await Promise.all(boundary.afterTasks.splice(0));
}

interface McpListItem { id: string; title: string; project: string; visibility: string; updatedAt: string }
interface McpRead extends McpListItem { content: string; baseVersion?: string }
interface McpVersion { id: string; latest: boolean; saveKind: string; savedBy: { handle: string | null; kind: string } | null }
interface McpInbox { mentions: { id: string; read: boolean; artifact: { id: string; title: string }; comment: { id: string; author: { handle: string | null } | null; body: { untrustedText: string } }; reply: { replyTo: string } }[] }

describe.runIf(Boolean(databaseUrl))("reviewer demo data with a database", async () => {
  const { and, eq, inArray, like, or, sql } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, artifactVersion, comment, sharingRequest, team, teamMember, user } = await import("@/db/schema");
  const { registerAllTools } = await import("@/lib/mcp/register-tools");
  const { listInbox, markInboxRead } = await import("@/lib/comments/inbox");
  const { createArtifact } = await import("@/lib/artifacts");
  const { createComment } = await import("@/lib/comments/service");
  const { listScopeProjects } = await import("@/lib/projects/queries");
  const { savePreferences } = await import("@/lib/notifications/preferences");
  const { defaultPreferences } = await import("@/lib/notifications/preference-rules");
  const { writeAccount } = await import("./create-reviewer-account.mts");
  const { assertSeedLanded, quietPreferences, ReviewerDemoRefusal, seedReviewerDemo, zeroCounts } = await import("./seed-reviewer-demo-data.mts");
  const { runSeed } = await import("./seed-reviewer-demo.mts");
  const rules = await import("./seed-reviewer-demo-rules.mts");

  const url = databaseUrl ?? "";
  const tag = randomUUID().slice(0, 8);
  const emailOf = (name: string) => `seed-db-${tag}-${name}@example.com`;
  const handleOf = (name: string) => `sd-${tag}-${name}`;
  const reviewer = { email: emailOf("a"), handle: handleOf("a"), id: "" };
  const commenter = { email: emailOf("b"), handle: handleOf("b"), id: "" };
  /** An ordinary person with an artifact, a project, and an inbox entry of their own, whom no run may touch. */
  const bystander = { email: emailOf("bystander"), handle: handleOf("bystander"), id: `sd-${tag}-bystander` };
  const seedRequest = { email: reviewer.email, commenterEmail: commenter.email, reset: false, preview: false };
  /** The test database is on this machine, so the reserved test domain counts as a reviewer domain. */
  const local = { allowTestDomain: true };
  let mcp: Client;

  async function makeReviewer(name: string) {
    await writeAccount(url, { email: emailOf(name), name: `Reviewer ${name}`, username: handleOf(name), resetPassword: false }, await hashPassword(`password-${name}-0123456789abcdef`));
    const [row] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, emailOf(name))).limit(1);
    return row?.id ?? "";
  }

  /** The bystander: their own artifact in their own project, shared by link, with a comment from the commenter that mentions them. */
  async function makeBystander() {
    await getDb().insert(user).values({ id: bystander.id, name: "Bystander", email: bystander.email, emailVerified: true, username: bystander.handle });
    const quiet = defaultPreferences();
    quiet.mention = { inApp: true, browser: false, email: false };
    await savePreferences(bystander.id, quiet);
    const notes = await createArtifact(bystander.id, { title: "Bystander notes", summary: "", content: "Notes.\n", kind: "markdown", project: "Bystander project" });
    await getDb().update(artifact).set({ visibility: "link", comments: "signed_in" }).where(eq(artifact.id, notes.id));
    await createComment({ actorId: commenter.id, publicId: notes.publicId, body: `@${bystander.handle} A note for you.` });
    await settle();
  }

  /** Calls one MCP tool as the reviewer and reads its JSON answer. */
  async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = (await mcp.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    const text = result.content[0]?.text ?? "";
    if (result.isError) throw new Error(`${name} failed: ${text}`);
    return JSON.parse(text) as T;
  }

  async function findOne(title: string) {
    const found = (await call<McpListItem[]>("artifacts_list", { query: title })).filter((item) => item.title === title);
    expect(found).toHaveLength(1);
    return call<McpRead>("artifacts_get", { id: found[0]?.id ?? "" });
  }

  /** Everything the test prompts can change, in a form two states can be compared in. */
  async function stateOf(userId: string) {
    // A join, never a correlated subquery: Drizzle leaves a single-table select's columns unqualified (AGENTS.md tripwire).
    const rows = await getDb()
      .select({ title: artifact.title, content: artifact.content, visibility: artifact.visibility, comments: artifact.comments, versions: sql<number>`count(${artifactVersion.id})::int` })
      .from(artifact)
      .leftJoin(artifactVersion, eq(artifactVersion.artifactId, artifact.id))
      .where(eq(artifact.userId, userId))
      .groupBy(artifact.id)
      .orderBy(artifact.title);
    const threads = await getDb().select({ body: comment.body, title: artifact.title }).from(comment).innerJoin(artifact, eq(artifact.id, comment.artifactId)).where(eq(artifact.userId, userId)).orderBy(comment.createdAt);
    const projects = (await listScopeProjects({ kind: "user", userId })).map(({ name, count }) => ({ name, count }));
    const inbox = (await listInbox(userId)).map((entry) => ({ title: entry.artifact.title, body: entry.comment.body, read: entry.readAt !== null }));
    return { artifacts: rows, threads, projects, inbox };
  }

  let seededState: Awaited<ReturnType<typeof stateOf>>;

  beforeAll(async () => {
    // Deletes outside a request cannot revalidate Next's cache; the app logs that and moves on.
    const warn = console.warn.bind(console);
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      if (typeof args[0] !== "string" || !args[0].startsWith("[versions] Cache tag not revalidated")) warn(...args);
    });
    reviewer.id = await makeReviewer("a");
    commenter.id = await makeReviewer("b");
    await makeBystander();
    await seedReviewerDemo(seedRequest, local);
    await settle();
    await assertSeedLanded(seedRequest, local);
    seededState = await stateOf(reviewer.id);
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerAllTools(server, reviewer.id, "full");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    mcp = new Client({ name: "directory-reviewer", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
  });

  afterAll(async () => {
    await mcp.close();
    await getDb().delete(team).where(like(team.slug, `sd-${tag}-%`));
    await getDb().delete(user).where(or(like(user.email, `seed-db-${tag}-%`), like(user.id, `sd-${tag}-%`)));
  });

  it("should list the Launch project holding its one artifact when the reviewer lists projects", async () => {
    expect(await call<{ name: string; icon: string | null; count: number }[]>("projects_list")).toEqual([{ name: rules.launchProject, icon: null, count: 1 }]);
  });

  it("should find the onboarding artifacts newest first when the reviewer searches for onboarding", async () => {
    const found = await call<McpListItem[]>("artifacts_list", { query: "onboarding" });

    expect(found.map((item) => item.title)).toEqual(["Onboarding guide", "Onboarding checklist", "Onboarding notes"]);
    const times = found.map((item) => Date.parse(item.updatedAt));
    expect(times[0]).toBeGreaterThan(times[1] ?? 0);
    expect(times[1]).toBeGreaterThan(times[2] ?? 0);
    expect((await call<McpRead>("artifacts_get", { id: found[0]?.id ?? "" })).content).toContain("First month");
  });

  it("should hold exactly one unchecked step, the database step, when the reviewer opens the release checklist", async () => {
    const checklist = await findOne("Release checklist");

    const unchecked = checklist.content.split("\n").filter((line) => line.startsWith("- [ ]"));
    expect(unchecked).toEqual([rules.databaseStep]);
    expect(checklist.content.split("\n").filter((line) => line.startsWith("- [x]")).length).toBeGreaterThan(1);
  });

  it("should wait one unread comment from the other reviewer on the API spec when the reviewer opens the inbox", async () => {
    const { mentions } = await call<McpInbox>("inbox_list");

    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({ read: false, artifact: { title: "API spec" }, comment: { author: { handle: commenter.handle } } });
    expect(mentions[0]?.comment.body.untrustedText).toContain("rate limits");
  });

  it("should list three versions saved by the reviewer when the reviewer opens the roadmap history", async () => {
    const roadmap = await findOne(rules.roadmapTitle);
    const versions = await call<McpVersion[]>("artifacts_versions", { id: roadmap.id });

    expect(versions).toHaveLength(3);
    expect(versions.map((version) => version.savedBy)).toEqual(Array(3).fill({ handle: reviewer.handle, kind: "person" }));
    expect(roadmap.content).toBe(rules.roadmapVersions[2]);
  });

  it("should show no acme-finance team and nothing to approve when the reviewer checks teams and requests", async () => {
    const teams = await call<{ slug: string; personal: boolean }[]>("teams_list");
    const memberOf = getDb().select({ teamId: teamMember.teamId }).from(teamMember).where(eq(teamMember.userId, reviewer.id));
    const pending = await getDb().select({ id: sharingRequest.id }).from(sharingRequest).where(and(eq(sharingRequest.status, "pending"), inArray(sharingRequest.teamId, memberOf)));

    expect(teams.map((item) => item.slug)).not.toContain("acme-finance");
    expect(teams).toEqual([expect.objectContaining({ slug: reviewer.handle, personal: true })]);
    expect(pending).toEqual([]);
  });

  it("should create nothing a second time when the seed runs again without reset", async () => {
    const outcome = await seedReviewerDemo(seedRequest, local);
    await settle();

    expect(outcome.alreadySeeded).toBe(true);
    expect(outcome.counts).toEqual(zeroCounts());
    expect(await stateOf(reviewer.id)).toEqual(seededState);
  });

  /** Prompt 1: save in the Launch project. */
  async function saveInLaunch() {
    const saved = await call<{ artifact: McpRead }>("artifacts_create", { title: "Launch plan", content: "Launch plan: ship beta on Friday, announce Monday.", project: rules.launchProject });
    expect(saved.artifact).toMatchObject({ project: rules.launchProject, visibility: "private" });
  }

  /** Prompt 3: mark the database step done, one line. */
  async function markDatabaseStepDone() {
    const checklist = await findOne("Release checklist");
    const done = checklist.content.replace(rules.databaseStep, rules.databaseStepDone);
    await call("artifacts_update", { id: checklist.id, content: done, baseVersion: checklist.baseVersion });
    expect((await findOne("Release checklist")).content).toBe(done);
  }

  /** Prompt 4: reply "Looks good" in the API spec thread, and mark the inbox entry handled. */
  async function replyLooksGood() {
    const [entry] = (await call<McpInbox>("inbox_list")).mentions;
    if (!entry) throw new Error("No inbox entry.");
    await call("comment_create", { artifact: entry.artifact.id, body: "Looks good", replyTo: entry.reply.replyTo });
    await call("inbox_mark_read", { ids: [entry.id] });
    await settle();
    expect((await call<{ total: number }>("comments_list", { artifact: entry.artifact.id })).total).toBe(2);
  }

  /** Prompt 5: restore the previous roadmap version, as a new save. */
  async function restorePreviousRoadmap() {
    const roadmap = await findOne(rules.roadmapTitle);
    const [, previous] = await call<McpVersion[]>("artifacts_versions", { id: roadmap.id });
    if (!previous) throw new Error("No previous version.");
    await call("artifacts_restore_version", { id: roadmap.id, version: previous.id, baseVersion: roadmap.baseVersion });
    expect((await findOne(rules.roadmapTitle)).content).toBe(rules.roadmapVersions[1]);
  }

  it("should put the account back to its first seeded state when the prompts' writes ran and then the reset", async () => {
    await saveInLaunch();
    await markDatabaseStepDone();
    await replyLooksGood();
    await restorePreviousRoadmap();
    expect(await stateOf(reviewer.id)).not.toEqual(seededState);
    const commenterBefore = await stateOf(commenter.id);
    const bystanderBefore = await stateOf(bystander.id);
    // The reply marked the inbox entry read, so the account is no longer at its starting state.
    await expect(assertSeedLanded(seedRequest, local)).rejects.toBeInstanceOf(ReviewerDemoRefusal);
    const plans: unknown[] = [];
    const onRemoving = (plan: unknown) => plans.push(plan);
    const beforeReset = await stateOf(reviewer.id);

    // A preview hands over the same plan and changes nothing.
    const preview = await seedReviewerDemo({ ...seedRequest, reset: true, preview: true }, { ...local, onRemoving });
    await settle();
    expect(preview).toMatchObject({ previewed: true, counts: zeroCounts() });
    expect(await stateOf(reviewer.id)).toEqual(beforeReset);

    const outcome = await seedReviewerDemo({ ...seedRequest, reset: true }, { ...local, onRemoving });
    await settle();
    await assertSeedLanded(seedRequest, local);

    // Said before anything went, by the preview and by the reset: the ten seeded artifacts and the one the first prompt saved (not demo data), and the Launch project.
    expect(plans).toEqual([{ artifacts: 11, otherArtifacts: 1, projects: 1 }, { artifacts: 11, otherArtifacts: 1, projects: 1 }]);
    expect(outcome.alreadySeeded).toBe(false);
    expect(await stateOf(reviewer.id)).toEqual(seededState);
    // A reset removes the reviewer's rows only: the other reviewer and an ordinary person keep theirs.
    expect(commenterBefore.artifacts).toHaveLength(3);
    expect(await stateOf(commenter.id)).toEqual(commenterBefore);
    expect(bystanderBefore).toMatchObject({ artifacts: [{ title: "Bystander notes" }], inbox: [{ title: "Bystander notes" }] });
    expect(await stateOf(bystander.id)).toEqual(bystanderBefore);
    expect(seededState.inbox).toEqual([{ title: "API spec", body: rules.apiSpecComment(reviewer.handle), read: false }]);
    expect(seededState.projects).toEqual([{ name: rules.launchProject, count: 1 }]);
    expect(seededState.artifacts.find((row) => row.title === rules.roadmapTitle)?.versions).toBe(3);
    expect(boundary.sendEmail).not.toHaveBeenCalled();
    expect(boundary.sendPush).not.toHaveBeenCalled();
  });

  it("should refuse an account without a password login, as reviewer or as commenter, and leave it untouched", async () => {
    const ordinaryId = `sd-${tag}-ordinary`;
    await getDb().insert(user).values({ id: ordinaryId, name: "Ordinary", email: emailOf("ordinary"), emailVerified: true, username: handleOf("ordinary") });

    await expect(seedReviewerDemo({ ...seedRequest, email: emailOf("ordinary"), reset: true }, local)).rejects.toBeInstanceOf(ReviewerDemoRefusal);
    await expect(seedReviewerDemo({ ...seedRequest, commenterEmail: emailOf("ordinary"), reset: true }, local)).rejects.toBeInstanceOf(ReviewerDemoRefusal);

    expect(await getDb().select({ id: artifact.id }).from(artifact).where(eq(artifact.userId, ordinaryId))).toEqual([]);
    expect(await stateOf(reviewer.id)).toEqual(seededState);
  });

  it("should refuse a database that is not on this machine when the allow flag is not set", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const code = await runSeed(["--email", reviewer.email, "--commenter-email", commenter.email], { DATABASE_URL: "postgres://user:secret@db.example.net/app" });

    expect(code).toBe(2);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("not on this machine"));
    expect(JSON.stringify(errors.mock.calls)).not.toContain("secret");
    errors.mockRestore();
  });

  it("should reset through the owner's command with nothing on stdout and one line of counts on stderr", async () => {
    const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
    const [, ...nodeArgs] = (scripts["reviewer:seed"] ?? "").split(" ");

    const run = spawnSync(process.execPath, [...nodeArgs, "--email", reviewer.email, "--commenter-email", commenter.email, "--reset"], { env: { PATH: process.env.PATH ?? "", DATABASE_URL: url, NODE_ENV: "test" }, encoding: "utf8", timeout: 180_000 });

    // The message carries what the child said, so a bad flag or a timeout (status null) explains itself.
    expect(run.status, `signal ${String(run.signal)}: ${run.stderr}`).toBe(0);
    expect(run.stdout).toBe("");
    // The lines that matter, in order; a warning from Node or a dependency on stderr is not this test's business.
    const lines = run.stderr.trim().split("\n");
    const notice = lines.indexOf("Reset: removing everything this account owns (10 artifacts, all of them demo data, and 1 project), then its inbox and notifications.");
    const report = lines.indexOf("Removed 10 artifacts, 1 project, 1 inbox entry, and 1 notification. Created 10 artifacts, 2 later versions, and 1 comment.");
    expect(notice).toBeGreaterThanOrEqual(0);
    expect(report).toBeGreaterThan(notice);
    expect(run.stderr).not.toMatch(/failed|Error/);
    expect(await stateOf(reviewer.id)).toEqual(seededState);
  });

  it("should stop and seed nothing when a reset cannot remove an artifact, then finish on the next reset", async () => {
    boundary.refuseDeletes = true;
    const refused = seedReviewerDemo({ ...seedRequest, reset: true }, local);

    await expect(refused).rejects.toBeInstanceOf(ReviewerDemoRefusal);
    await expect(refused).rejects.toThrow("0 of 10");
    boundary.refuseDeletes = false;
    await settle();
    // Nothing was seeded on top of what could not be removed, and the inbox was not touched: artifacts go first.
    expect(await stateOf(reviewer.id)).toEqual(seededState);

    await seedReviewerDemo({ ...seedRequest, reset: true }, local);
    await settle();
    await assertSeedLanded(seedRequest, local);
    expect(await stateOf(reviewer.id)).toEqual(seededState);
  });

  it("should refuse and name the titles when the account holds only some of the demo data, until a reset", async () => {
    const [checklist] = await getDb().select({ id: artifact.id }).from(artifact).where(and(eq(artifact.userId, reviewer.id), eq(artifact.title, "Release checklist"))).limit(1);
    await getDb().delete(artifact).where(eq(artifact.id, checklist?.id ?? ""));
    const partial = await stateOf(reviewer.id);

    const refused = seedReviewerDemo(seedRequest, local);

    await expect(refused).rejects.toBeInstanceOf(ReviewerDemoRefusal);
    await expect(refused).rejects.toThrow('lacks "Release checklist"');
    expect(await stateOf(reviewer.id)).toEqual(partial);

    await seedReviewerDemo({ ...seedRequest, reset: true }, local);
    await settle();
    expect(await stateOf(reviewer.id)).toEqual(seededState);
  });

  it("should reach the email and push boundaries when someone's settings keep them on, so the spies would see a send", async () => {
    const loud = defaultPreferences();
    loud.mention = { inApp: true, browser: true, email: true };
    await savePreferences(reviewer.id, loud);
    boundary.sendEmail.mockResolvedValue({ data: { id: "sent" }, error: null });
    await markInboxRead(reviewer.id, "all");
    const [spec] = await getDb().select({ publicId: artifact.publicId }).from(artifact).where(and(eq(artifact.userId, reviewer.id), eq(artifact.title, "API spec"))).limit(1);

    await createComment({ actorId: commenter.id, publicId: spec?.publicId ?? "", body: `@${reviewer.handle} One more question.` });
    await settle();

    expect(boundary.sendEmail).toHaveBeenCalledTimes(1);
    expect(boundary.sendPush).toHaveBeenCalledTimes(1);
    // Back to the seeded state (settings, the read inbox entry, and the extra comment), so a test added after this one starts where the others do.
    await savePreferences(reviewer.id, quietPreferences());
    await seedReviewerDemo({ ...seedRequest, reset: true }, local);
    await settle();
    expect(await stateOf(reviewer.id)).toEqual(seededState);
  });

  it("should refuse an address outside the reviewer domains before it reads or removes anything, even one with a password login", async () => {
    // The same account, asked for as it would be on a shared database, where the reserved test domain does not count.
    const refused = seedReviewerDemo({ ...seedRequest, reset: true }, { allowTestDomain: false });

    await expect(refused).rejects.toBeInstanceOf(ReviewerDemoRefusal);
    await expect(refused).rejects.toThrow("not under a reviewer domain");
    await expect(assertSeedLanded(seedRequest, { allowTestDomain: false })).rejects.toThrow("not under a reviewer domain");
    expect(await stateOf(reviewer.id)).toEqual(seededState);
  });
});
