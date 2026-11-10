import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * createArtifactOnce against a real Postgres, for what mocks cannot show:
 * two creates racing with one create id store one artifact (the partial
 * unique index), and a create id is scoped to its user. A title-only page
 * can go to Files and back to empty Markdown, and no update can empty a body
 * that has content (updateCheckOptions). It runs only when
 * TEST_DATABASE_URL names a throwaway local database with the migrations
 * applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("createArtifactOnce with a database", async () => {
  const { eq, inArray, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, rateLimitBucket, user } = await import("@/db/schema");
  const { createArtifactOnce } = await import("./create-once");
  const { updateArtifact } = await import("@/lib/artifacts");
  const { ArtifactContentError } = await import("@/lib/artifact-content");

  const tag = randomUUID().slice(0, 8);
  const users = { ada: `createdb-${tag}-ada`, bo: `createdb-${tag}-bo` };
  const input = { title: "Plan", content: "", kind: "markdown" as const };
  const rowsOf = (userId: string) => getDb().select({ id: artifact.id, requestId: artifact.createRequestId, sessionId: artifact.sessionId }).from(artifact).where(eq(artifact.userId, userId));

  beforeAll(async () => {
    await getDb().insert(user).values(Object.values(users).map((id) => ({ id, name: id, email: `${id}@example.com` })));
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifact).where(inArray(artifact.userId, Object.values(users)));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%createdb-${tag}-%`));
    await db.delete(user).where(inArray(user.id, Object.values(users)));
  });

  it("should store one artifact and hand both callers its id when two creates race with one create id", async () => {
    const requestId = randomUUID();
    const results = await Promise.all([createArtifactOnce(users.ada, input, [], requestId), createArtifactOnce(users.ada, input, [], requestId)]);
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    const rows = (await rowsOf(users.ada)).filter((row) => row.requestId === requestId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionId, "the create id never rides in the agent's session id").toBe("");
  });

  it("should hand back the first artifact when a retry comes after the create finished", async () => {
    const requestId = randomUUID();
    const first = await createArtifactOnce(users.ada, input, [], requestId);
    const retry = await createArtifactOnce(users.ada, input, [], requestId);
    expect(retry).toEqual({ id: first.id, created: false });
  });

  it("should give each person their own artifact when two people send the same create id", async () => {
    const requestId = randomUUID();
    const ada = await createArtifactOnce(users.ada, input, [], requestId);
    const bo = await createArtifactOnce(users.bo, input, [], requestId);
    expect(bo.created).toBe(true);
    expect(bo.id).not.toBe(ada.id);
  });

  it("should let a title-only page go to Files and back to empty Markdown", async () => {
    const page = await createArtifactOnce(users.ada, input, [], randomUUID());
    expect((await updateArtifact(users.ada, page.id, { kind: "file" }))?.kind).toBe("file");
    const back = await updateArtifact(users.ada, page.id, { kind: "markdown", content: "" });
    expect(back?.kind).toBe("markdown");
    expect(back?.content).toBe("");
  });

  it("should refuse an update that empties a body that has content", async () => {
    const page = await createArtifactOnce(users.ada, input, [], randomUUID());
    await updateArtifact(users.ada, page.id, { content: "# Notes" });
    await expect(updateArtifact(users.ada, page.id, { content: "" })).rejects.toThrow(ArtifactContentError);
    await expect(updateArtifact(users.ada, page.id, { kind: "markdown", content: "" })).rejects.toThrow(ArtifactContentError);
    await updateArtifact(users.ada, page.id, { kind: "file" });
    await expect(updateArtifact(users.ada, page.id, { kind: "markdown", content: "" }), "a Files page with notes keeps them").rejects.toThrow(ArtifactContentError);
    const [row] = await getDb().select({ content: artifact.content }).from(artifact).where(eq(artifact.id, page.id));
    expect(row?.content).toBe("# Notes");
  });
});
