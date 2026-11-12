import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * A comment that keeps "@dana" from being a mention (`\@dana`) must not
 * notify dana when it is edited in the rich comment box: the box writes the
 * escape back, and the service finds no mention in what it saves. Runs the
 * box's own Markdown round trip and the real comment service against a
 * real Postgres. It runs only when TEST_DATABASE_URL names a throwaway local
 * database with the migrations applied (`pnpm db:migrate`); never point it
 * at a shared one.
 */

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/notifications/create", () => ({ notifyComment: vi.fn() }));
vi.mock("./mention-email", () => ({ sendMentionEmail: vi.fn() }));

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("an escaped mention edited in the comment box", async () => {
  const { eq, inArray, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, comment, mention, rateLimitBucket, user } = await import("@/db/schema");
  const { generatePublicId } = await import("@/lib/public-id");
  const { parseCommentMarkdown, serializeCommentMarkdown } = await import("@/components/comments/comment-markdown");
  const { createComment, updateComment } = await import("./service");

  const tag = randomUUID().slice(0, 8);
  // Dana wrote the artifact, so a comment on it may mention her.
  const ids = { writer: `escaped-${tag}-writer`, dana: `escaped-${tag}-dana`, doc: `escaped-${tag}-doc` };
  const dana = `dana-${tag}`;
  const publicId = generatePublicId();

  /** What the comment box saves after a person changes "please" to "thanks" in the block kept as written. */
  function editedInBox(body: string): string {
    const loaded = parseCommentMarkdown(body);
    const content = (loaded.doc.content ?? []).map((block) => {
      const source: unknown = block.attrs?.source;
      if (block.type !== "rawMarkdown" || typeof source !== "string") return block;
      return { ...block, attrs: { ...block.attrs, source: source.replace("please", "thanks") } };
    });
    return serializeCommentMarkdown({ type: "doc", content }, loaded.source);
  }

  const mentionsOf = async (commentId: string) => getDb().select({ recipientId: mention.recipientId }).from(mention).where(eq(mention.commentId, commentId));

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([
      { id: ids.writer, name: "Writer", email: `${ids.writer}@example.com` },
      { id: ids.dana, name: "Dana", email: `${ids.dana}@example.com`, username: dana },
    ]);
    await db.insert(artifact).values({ id: ids.doc, userId: ids.dana, updatedBy: ids.dana, kind: "markdown", title: "Plan", content: "# Plan\n", visibility: "public", comments: "signed_in", shareId: randomUUID().replaceAll("-", ""), publicId });
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(mention).where(eq(mention.artifactId, ids.doc));
    await db.delete(comment).where(eq(comment.artifactId, ids.doc));
    await db.delete(artifact).where(eq(artifact.id, ids.doc));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%escaped-${tag}-%`));
    await db.delete(user).where(inArray(user.id, [ids.writer, ids.dana]));
  });

  it("should notify nobody when a comment with an escaped handle is edited in the box", async () => {
    const created = await createComment({ actorId: ids.writer, publicId, body: `\\@${dana} please` });
    expect(created.mentions.notified).toEqual([]);

    const saved = editedInBox(created.comment.body);
    expect(saved).toBe(`\\@${dana} thanks`);
    const edited = await updateComment({ actorId: ids.writer, commentId: created.comment.id, body: saved });

    expect(edited.mentions.notified).toEqual([]);
    expect(await mentionsOf(created.comment.id)).toEqual([]);
  });

  it("should notify the person when the handle is a real mention", async () => {
    const created = await createComment({ actorId: ids.writer, publicId, body: "Draft" });
    const edited = await updateComment({ actorId: ids.writer, commentId: created.comment.id, body: `@${dana} thanks` });

    expect(edited.mentions.notified).toEqual([{ handle: dana, kind: "person" }]);
    expect(await mentionsOf(created.comment.id)).toEqual([{ recipientId: ids.dana }]);
  });
});
