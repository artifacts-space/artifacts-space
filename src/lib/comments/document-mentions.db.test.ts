import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A mention in a document's own text: `@handle` in a Markdown artifact
 * notifies that teammate or agent when a save finds it. Runs the real save
 * path, the delivery, the Inbox, and the bell against a real Postgres. It
 * runs only when TEST_DATABASE_URL names a throwaway local database with the
 * migrations applied (`pnpm db:migrate`); never point it at a shared one.
 */

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
const sendMentionEmail = vi.fn();
vi.mock("./mention-email", () => ({ sendMentionEmail }));

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("mentions in a document's own text", async () => {
  const { and, eq, inArray, isNull, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { notification } = await import("@/db/notification-schema");
  const { agent, artifact, artifactVersion, mention, rateLimitBucket, sharingRequest, team, teamMember, user } = await import("@/db/schema");
  const { createArtifact, updateArtifact } = await import("@/lib/artifacts");
  const { encodeBaseVersion } = await import("@/lib/edits/edit-conflict-rules");
  const { decideSharingRequest } = await import("@/lib/sharing/service");
  const { listNotifications, markNotificationsRead } = await import("@/lib/notifications/feed");
  const { generatePublicId } = await import("@/lib/public-id");
  const { deliverDocumentMentions, deliverDocumentMentionsAfterSharing } = await import("./document-mentions");
  const { listInbox, markInboxRead } = await import("./inbox");

  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `docmention-${tag}-${name}`;
  const handle = (name: string) => `${name}-${tag}`;
  const ids = { writer: id("writer"), ada: id("ada"), outsider: id("outsider"), claude: id("claude"), helper: id("helper"), crew: id("crew"), press: id("press") };
  const docs: string[] = [];

  type Row = typeof artifact.$inferSelect;

  /** A Markdown artifact the writer wrote, shared with the crew unless told otherwise. */
  async function makeDoc(content: string, overrides: Partial<Row> = {}): Promise<Row> {
    const docId = id(`doc-${String(docs.length)}`);
    docs.push(docId);
    const [row] = await getDb()
      .insert(artifact)
      .values({ id: docId, userId: ids.writer, updatedBy: ids.writer, kind: "markdown", title: "Plan", content, visibility: "team", teamId: ids.crew, comments: "team", shareId: randomUUID().replaceAll("-", ""), publicId: generatePublicId(), ...overrides })
      .returning();
    if (!row) throw new Error("The test artifact was not created.");
    return row;
  }

  /** A save of new text, as the delivery sees it: the row before and the row after. */
  async function save(before: Row, content: string, editorId: string = ids.writer): Promise<Row> {
    const [after] = await getDb().update(artifact).set({ content, updatedBy: editorId }).where(eq(artifact.id, before.id)).returning();
    if (!after) throw new Error("The test artifact is gone.");
    await deliverDocumentMentions({ before, after, editorId });
    return after;
  }

  const inDocument = (artifactId: string) => and(eq(mention.artifactId, artifactId), isNull(mention.commentId));
  const mentionsOf = async (artifactId: string) =>
    (await getDb().select({ recipientId: mention.recipientId, actorId: mention.actorId, readAt: mention.readAt }).from(mention).where(inDocument(artifactId))).sort((a, b) => a.recipientId.localeCompare(b.recipientId));
  const bellOf = (recipientId: string, artifactId: string) =>
    getDb().select({ type: notification.type, commentId: notification.commentId, actorId: notification.actorId, readAt: notification.readAt }).from(notification).where(and(eq(notification.recipientId, recipientId), eq(notification.artifactId, artifactId)));

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([
      { id: ids.writer, name: "Writer", email: `${ids.writer}@example.com`, username: handle("writer") },
      { id: ids.ada, name: "Ada", email: `${ids.ada}@example.com`, username: handle("ada") },
      // A person with a handle who shares no team with the writer.
      { id: ids.outsider, name: "Outsider", email: `${ids.outsider}@example.com`, username: handle("outsider") },
      { id: ids.claude, name: "Claude", email: `${ids.claude}@example.com`, username: handle("claude") },
      { id: ids.helper, name: "Helper", email: `${ids.helper}@example.com`, username: handle("helper") },
    ]);
    // The press team is the writer's alone: Ada, their teammate in the crew, reads its public artifacts as an outside reader.
    await db.insert(team).values([{ id: ids.crew, name: "Crew", slug: ids.crew, personal: false }, { id: ids.press, name: "Press", slug: ids.press, personal: false }]);
    await db.insert(teamMember).values([
      { id: id("m-press"), teamId: ids.press, userId: ids.writer, role: "owner" },
      { id: id("m-writer"), teamId: ids.crew, userId: ids.writer, role: "owner" },
      { id: id("m-ada"), teamId: ids.crew, userId: ids.ada, role: "member" },
      { id: id("m-claude"), teamId: ids.crew, userId: ids.claude, role: "member" },
      { id: id("m-helper"), teamId: ids.crew, userId: ids.helper, role: "member" },
    ]);
    await db.insert(agent).values([
      { userId: ids.claude, teamId: ids.crew, ownerId: ids.writer },
      { userId: ids.helper, teamId: ids.crew, ownerId: ids.writer },
    ]);
  });

  beforeEach(() => {
    sendMentionEmail.mockClear();
  });

  afterAll(async () => {
    const db = getDb();
    const people = [ids.writer, ids.ada, ids.outsider, ids.claude, ids.helper];
    if (docs.length > 0) {
      await db.delete(notification).where(inArray(notification.artifactId, docs));
      await db.delete(mention).where(inArray(mention.artifactId, docs));
      await db.delete(artifactVersion).where(inArray(artifactVersion.artifactId, docs));
      await db.delete(artifact).where(inArray(artifact.id, docs));
    }
    await db.delete(agent).where(inArray(agent.userId, people));
    // The team goes whole: its members cannot be removed one by one down to none (team_keeps_an_owner).
    await db.delete(team).where(inArray(team.id, [ids.crew, ids.press]));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%docmention-${tag}-%`));
    await db.delete(user).where(inArray(user.id, people));
  });

  it("should give a teammate and an agent an inbox entry, and the teammate a bell entry and one email, when a save adds their handles", async () => {
    const doc = await makeDoc("# Plan\n");
    await save(doc, `# Plan\n\nCan @${handle("ada")} check this, and @${handle("claude")} tighten it?\n`);

    expect(await mentionsOf(doc.id)).toEqual([
      { recipientId: ids.ada, actorId: ids.writer, readAt: null },
      { recipientId: ids.claude, actorId: ids.writer, readAt: null },
    ]);
    // The bell is for people; an agent reads its inbox.
    expect(await bellOf(ids.ada, doc.id)).toEqual([{ type: "mention", commentId: null, actorId: ids.writer, readAt: null }]);
    expect(await bellOf(ids.claude, doc.id)).toEqual([]);
    expect(sendMentionEmail).toHaveBeenCalledTimes(1);
    expect(sendMentionEmail.mock.calls[0]?.[0]).toMatchObject({ email: `${ids.ada}@example.com`, publicId: doc.publicId, commentId: undefined });
  });

  it("should tell nobody again when a later save keeps the same handles", async () => {
    const doc = await makeDoc("# Plan\n");
    const first = await save(doc, `Ask @${handle("ada")}.\n`);
    sendMentionEmail.mockClear();

    await save(first, `Ask @${handle("ada")}. More words.\n`);

    expect(await mentionsOf(doc.id)).toHaveLength(1);
    expect(await bellOf(ids.ada, doc.id)).toHaveLength(1);
    expect(sendMentionEmail).not.toHaveBeenCalled();
  });

  it("should tell nobody when the handle is unknown, belongs to someone outside the writer's teams, is the writer's own, or sits in code", async () => {
    const doc = await makeDoc("# Plan\n");
    await save(doc, `@nobody-${tag} @${handle("outsider")} @${handle("writer")} and \`@${handle("ada")}\`\n`);

    expect(await mentionsOf(doc.id)).toEqual([]);
    expect(sendMentionEmail).not.toHaveBeenCalled();
  });

  it("should tell the person again when their handle is added anew after they read the first mention, and not before", async () => {
    const doc = await makeDoc("# Plan\n");
    const mentioned = await save(doc, `Ask @${handle("ada")}.\n`);
    const removed = await save(mentioned, "Ask nobody.\n");
    // Added again while the first one is unread: nothing new.
    const again = await save(removed, `Ask @${handle("ada")} again.\n`);
    expect(sendMentionEmail).toHaveBeenCalledTimes(1);

    await markInboxRead(ids.ada, "all");
    expect((await bellOf(ids.ada, doc.id))[0]?.readAt).not.toBeNull();
    const removedAgain = await save(again, "Ask nobody.\n");
    await save(removedAgain, `Now @${handle("ada")} once more.\n`);

    expect(await mentionsOf(doc.id)).toEqual([{ recipientId: ids.ada, actorId: ids.writer, readAt: null }]);
    expect(await bellOf(ids.ada, doc.id)).toEqual([{ type: "mention", commentId: null, actorId: ids.writer, readAt: null }]);
    expect(sendMentionEmail).toHaveBeenCalledTimes(2);
  });

  it("should notify people but never agents when an agent's save adds the handles", async () => {
    const doc = await makeDoc("# Plan\n");
    await save(doc, `@${handle("ada")} and @${handle("helper")}: done.\n`, ids.claude);

    expect(await mentionsOf(doc.id)).toEqual([{ recipientId: ids.ada, actorId: ids.claude, readAt: null }]);
  });

  it("should tell nobody about a private artifact, then tell them once it is shared with their team, and only once", async () => {
    const doc = await makeDoc("# Draft\n", { visibility: "private", teamId: null, comments: "off" });
    await save(doc, `For @${handle("ada")}.\n`);
    expect(await mentionsOf(doc.id)).toEqual([]);

    await getDb().update(artifact).set({ visibility: "team", teamId: ids.crew }).where(eq(artifact.id, doc.id));
    await deliverDocumentMentionsAfterSharing(doc.id);

    expect(await mentionsOf(doc.id)).toEqual([{ recipientId: ids.ada, actorId: ids.writer, readAt: null }]);
    expect(sendMentionEmail).toHaveBeenCalledTimes(1);

    // Another sharing change tells nobody again.
    await deliverDocumentMentionsAfterSharing(doc.id);
    expect(sendMentionEmail).toHaveBeenCalledTimes(1);
  });

  it("should tell the people the text names when an owner approves the request that shares it with their team", async () => {
    const doc = await makeDoc("# Draft\n", { visibility: "private", teamId: null, comments: "off" });
    await save(doc, `For @${handle("ada")}.\n`);
    expect(await mentionsOf(doc.id)).toEqual([]);
    const requestId = id(`request-${doc.id}`);
    await getDb().insert(sharingRequest).values({ id: requestId, artifactId: doc.id, teamId: ids.crew, requestedBy: ids.writer, kind: "sharing", visibility: "team", comments: "team" });

    await decideSharingRequest({ deciderId: ids.writer, requestId, approve: true });

    // The delivery runs after the response; outside a request it starts at once and is not awaited.
    await vi.waitFor(async () => { expect(await mentionsOf(doc.id)).toEqual([{ recipientId: ids.ada, actorId: ids.writer, readAt: null }]); }, { timeout: 5000 });
    expect(sendMentionEmail).toHaveBeenCalledTimes(1);
  });

  it("should tell a reader outside the team only once the edit that names them is approved", async () => {
    const created = await createArtifact(ids.writer, { title: "Notes", content: "# Notes\n\nNothing yet.\n" });
    docs.push(created.id);
    const [shared] = await getDb().update(artifact).set({ teamId: ids.press, visibility: "public" }).where(eq(artifact.id, created.id)).returning();
    if (!shared) throw new Error("The test artifact is gone.");

    // An agent's edit to a public artifact waits for approval: outside readers keep the approved text.
    const edited = await updateArtifact(ids.writer, created.id, { content: `# Notes\n\nOver to @${handle("ada")}.\n` }, "agent", { harness: { harness: "claude-code", label: null }, baseVersion: encodeBaseVersion({ versionId: null, updatedAt: shared.updatedAt }) });
    expect(edited?.pendingEdit).not.toBeNull();
    const [request] = await getDb().select().from(sharingRequest).where(and(eq(sharingRequest.artifactId, created.id), eq(sharingRequest.kind, "edit"), eq(sharingRequest.status, "pending")));
    if (!request) throw new Error("The edit was not filed for approval.");
    await deliverDocumentMentions({ before: shared, after: { ...shared, content: `# Notes\n\nOver to @${handle("ada")}.\n` }, editorId: ids.writer });
    expect(await mentionsOf(created.id)).toEqual([]);

    await decideSharingRequest({ deciderId: ids.writer, requestId: request.id, approve: true });

    await vi.waitFor(async () => { expect(await mentionsOf(created.id)).toEqual([{ recipientId: ids.ada, actorId: ids.writer, readAt: null }]); }, { timeout: 5000 });
  });

  it("should reach a handle past the look-up window once the handles before it have been told or reach nobody", async () => {
    // Fifty handles that reach nobody fill one save's window; Ada is the fifty-first.
    const unknown = Array.from({ length: 49 }, (_, index) => `@nobody${String(index)}-${tag}`).join(" ");
    const doc = await makeDoc("# Plan\n");
    const first = await save(doc, `${unknown} @${handle("claude")} @${handle("ada")}\n`);
    expect((await mentionsOf(doc.id)).map((row) => row.recipientId)).toEqual([ids.claude]);

    // Claude has been told, so the window now reaches Ada.
    await save(first, `${first.content}\nMore.\n`);
    expect((await mentionsOf(doc.id)).map((row) => row.recipientId)).toEqual([ids.ada, ids.claude]);
  });

  it("should tell nobody when the artifact is not Markdown", async () => {
    const doc = await makeDoc("<p>x</p>", { kind: "html" });
    await save(doc, `<p>@${handle("ada")}</p>`);

    expect(await mentionsOf(doc.id)).toEqual([]);
  });

  it("should list the mention in the inbox and the bell with the block that names the reader, and drop it once the text no longer does", async () => {
    const doc = await makeDoc("# Plan\n");
    const mentioned = await save(doc, `# Plan\n\nIntro.\n\nCan @${handle("ada")} check the numbers?\n\nOutro.\n`);

    const inbox = (await listInbox(ids.ada)).filter((entry) => entry.artifact.publicId === doc.publicId);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ source: "document", block: `Can @${handle("ada")} check the numbers?`, author: { userId: ids.writer } });
    const bell = (await listNotifications(ids.ada)).filter((entry) => entry.artifact.publicId === doc.publicId);
    expect(bell).toHaveLength(1);
    expect(bell[0]).toMatchObject({ type: "mention", inDocument: true, excerpt: `Can @${handle("ada")} check the numbers?`, href: `/app?artifact=${doc.publicId}` });
    // The agent's inbox lists its own mentions only.
    expect((await listInbox(ids.claude)).filter((entry) => entry.artifact.publicId === doc.publicId)).toEqual([]);

    await save(mentioned, "# Plan\n\nIntro.\n\nOutro.\n");

    expect((await listInbox(ids.ada)).filter((entry) => entry.artifact.publicId === doc.publicId)).toEqual([]);
    expect((await listNotifications(ids.ada)).filter((entry) => entry.artifact.publicId === doc.publicId)).toEqual([]);
  });

  it("should mark the inbox entry read when the bell's entry is read", async () => {
    const doc = await makeDoc("# Plan\n");
    await save(doc, `Ask @${handle("ada")}.\n`);
    const [entry] = (await listNotifications(ids.ada)).filter((item) => item.artifact.publicId === doc.publicId);

    await markNotificationsRead(ids.ada, entry ? [entry.id] : []);

    expect((await mentionsOf(doc.id))[0]?.readAt).not.toBeNull();
  });

  it("should deliver through the real save path when a person saves the artifact", async () => {
    const doc = await makeDoc("# Plan\n");

    await updateArtifact(ids.writer, doc.id, { content: `# Plan\n\nOver to @${handle("claude")}.\n` });

    // The delivery runs after the response; outside a request it starts at once and is not awaited.
    await vi.waitFor(async () => { expect(await mentionsOf(doc.id)).toEqual([{ recipientId: ids.claude, actorId: ids.writer, readAt: null }]); }, { timeout: 5000 });
  });
});
