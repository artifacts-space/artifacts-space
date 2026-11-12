import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Inline comments against a real Postgres: a comment made on words, a
 * thread resolved and reopened, and the privacy rule for quotes. A public
 * artifact serves its approved version to readers outside its team while the
 * author works on a newer one, so those readers must never get a quote, or
 * text around one, that the approved version does not hold.
 * It runs only when TEST_DATABASE_URL names a throwaway local database with
 * the migrations applied (`pnpm db:migrate`); never point it at a shared one.
 */

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/notifications/create", () => ({ notifyComment: vi.fn() }));

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("inline comments with a database", async () => {
  const { eq, inArray, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, artifactVersion, comment, rateLimitBucket, user } = await import("@/db/schema");
  const { generatePublicId } = await import("@/lib/public-id");
  const { createComment, listComments, resolveComment } = await import("./service");

  const tag = randomUUID().slice(0, 8);
  const ids = { author: `inline-${tag}-author`, reader: `inline-${tag}-reader`, doc: `inline-${tag}-doc`, version: randomUUID() };
  const publicId = generatePublicId();
  const approved = "# Launch plan\n\nWe ship the **beta** on Monday.\n";
  const latest = "# Launch plan\n\nSecret plan: we ship the **beta** on Monday. Then we acquire Northwind.\n";

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([ids.author, ids.reader].map((userId) => ({ id: userId, name: userId, email: `${userId}@example.com` })));
    await db.insert(artifact).values({ id: ids.doc, userId: ids.author, updatedBy: ids.author, kind: "markdown", title: "Launch plan", content: latest, visibility: "public", comments: "signed_in", shareId: randomUUID().replaceAll("-", ""), publicId });
    await db.insert(artifactVersion).values({ id: ids.version, artifactId: ids.doc, title: "Launch plan", kind: "markdown", content: approved, createdBy: ids.author });
    await db.update(artifact).set({ approvedVersionId: ids.version }).where(eq(artifact.id, ids.doc));
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(comment).where(eq(comment.artifactId, ids.doc));
    await db.update(artifact).set({ approvedVersionId: null }).where(eq(artifact.id, ids.doc));
    await db.delete(artifactVersion).where(eq(artifactVersion.artifactId, ids.doc));
    await db.delete(artifact).where(eq(artifact.id, ids.doc));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%inline-${tag}-%`));
    await db.delete(user).where(inArray(user.id, [ids.author, ids.reader]));
  });

  it("should save a person's words even when the saved content does not hold them yet", async () => {
    const result = await createComment({ actorId: ids.author, publicId, body: "Not yet.", anchor: { quote: "words still being typed", prefix: "", suffix: "" } });
    expect(result.comment).toMatchObject({ anchored: true, anchor: { quote: "words still being typed" }, canResolve: true });
  });

  it("should refuse words when the comment is a reply", async () => {
    const root = await createComment({ actorId: ids.author, publicId, body: "Root." });
    await expect(createComment({ actorId: ids.author, publicId, body: "Reply.", parentId: root.comment.id, anchor: { quote: "beta", prefix: "", suffix: "" } })).rejects.toThrow(/reply cannot be made on words/);
  });

  it("should never give a reader of the approved version a quote or nearby text from an unapproved edit", async () => {
    const hidden = await createComment({ actorId: ids.author, publicId, body: "Keep this quiet.", anchor: { quote: "acquire Northwind", prefix: "Monday. Then we", suffix: "." } });
    const shown = await createComment({ actorId: ids.author, publicId, body: "Which beta?", anchor: { quote: "the beta", prefix: "Secret plan: we ship", suffix: "on Monday." } });

    const { comments } = await listComments(ids.reader, publicId);
    const byId = new Map(comments.map((item) => [item.id, item]));

    expect(byId.get(hidden.comment.id)).toMatchObject({ anchored: true, anchor: null });
    expect(byId.get(shown.comment.id)?.anchor).toEqual({ quote: "the beta", prefix: "Launch plan We ship", suffix: "on Monday." });
    expect(JSON.stringify(comments)).not.toMatch(/Northwind|Secret plan/);

    const forAuthor = new Map((await listComments(ids.author, publicId)).comments.map((item) => [item.id, item]));
    expect(forAuthor.get(hidden.comment.id)?.anchor?.quote).toBe("acquire Northwind");
  });

  it("should resolve and reopen a thread without marking it edited when a reader does it twice", async () => {
    const created = await createComment({ actorId: ids.author, publicId, body: "Done?", anchor: { quote: "Monday", prefix: "", suffix: "" } });

    const first = await resolveComment({ actorId: ids.reader, commentId: created.comment.id, resolved: true });
    const again = await resolveComment({ actorId: ids.author, commentId: created.comment.id, resolved: true });
    expect(first.resolved?.by).toBe(ids.reader);
    expect(again.resolved).toEqual(first.resolved);
    expect(again.edited).toBe(false);
    expect(again.updatedAt).toBe(created.comment.updatedAt);

    const reopened = await resolveComment({ actorId: ids.reader, commentId: created.comment.id, resolved: false });
    expect(reopened.resolved).toBeNull();
    const [row] = await getDb().select({ resolvedAt: comment.resolvedAt, resolvedBy: comment.resolvedBy }).from(comment).where(eq(comment.id, created.comment.id));
    expect(row).toEqual({ resolvedAt: null, resolvedBy: null });
  });

  it("should refuse to resolve when the comment is a reply", async () => {
    const root = await createComment({ actorId: ids.author, publicId, body: "Root." });
    const reply = await createComment({ actorId: ids.reader, publicId, body: "Reply.", parentId: root.comment.id });
    await expect(resolveComment({ actorId: ids.author, commentId: reply.comment.id, resolved: true })).rejects.toThrow(/first comment/);
  });
});
