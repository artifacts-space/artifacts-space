import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as R2 from "./r2";

/*
 * removeUnattachedUpload against a real Postgres: the check and the delete
 * are one statement, so a file attached at any moment before it (another
 * tab, an agent) stays with its artifact. R2 is stubbed at its boundary. It
 * runs only when TEST_DATABASE_URL names a throwaway local database with the
 * migrations applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

const r2 = vi.hoisted(() => ({ deleteObject: vi.fn(() => Promise.resolve()), r2ConfigFromEnv: vi.fn(() => ({})) }));
vi.mock("./r2", async (importOriginal) => ({ ...(await importOriginal<typeof R2>()), ...r2 }));

describe.runIf(Boolean(databaseUrl))("removeUnattachedUpload with a database", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, artifactFile, user } = await import("@/db/schema");
  const { removeUnattachedUpload } = await import("./store");

  const tag = randomUUID().slice(0, 8);
  const users = { ada: `discarddb-${tag}-ada`, bo: `discarddb-${tag}-bo` };
  const artifactId = randomUUID();

  async function upload(uploaderId: string, attachedTo: string | null = null) {
    const id = randomUUID();
    await getDb().insert(artifactFile).values({ id, uploaderId, artifactId: attachedTo, key: `files/${id}/a.pdf`, filename: "a.pdf", contentType: "application/pdf", size: 8, status: "ready" });
    return id;
  }
  const exists = async (id: string) => (await getDb().select({ id: artifactFile.id }).from(artifactFile).where(eq(artifactFile.id, id))).length === 1;

  beforeAll(async () => {
    await getDb().insert(user).values(Object.values(users).map((id) => ({ id, name: id, email: `${id}@example.com` })));
    await getDb().insert(artifact).values({ id: artifactId, userId: users.ada, updatedBy: users.ada, title: "Kept", content: "", kind: "file", shareId: randomUUID().replaceAll("-", ""), publicId: `discard${tag}` });
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifactFile).where(inArray(artifactFile.uploaderId, Object.values(users)));
    await db.delete(artifact).where(eq(artifact.id, artifactId));
    await db.delete(user).where(inArray(user.id, Object.values(users)));
  });

  it("should delete the uploader's own unattached upload and its object", async () => {
    const id = await upload(users.ada);
    r2.deleteObject.mockClear();
    expect(await removeUnattachedUpload(id, users.ada)).toBe(true);
    expect(await exists(id)).toBe(false);
    expect(r2.deleteObject).toHaveBeenCalledWith(expect.anything(), `files/${id}/a.pdf`);
  });

  it("should leave a file alone when it was attached before the delete ran", async () => {
    const id = await upload(users.ada);
    // The attach lands between the page deciding to discard and the delete.
    await getDb().update(artifactFile).set({ artifactId, attachedAt: new Date() }).where(eq(artifactFile.id, id));
    r2.deleteObject.mockClear();
    expect(await removeUnattachedUpload(id, users.ada)).toBe(false);
    expect(await exists(id)).toBe(true);
    expect(r2.deleteObject).not.toHaveBeenCalled();
  });

  it("should leave someone else's upload alone", async () => {
    const id = await upload(users.bo);
    expect(await removeUnattachedUpload(id, users.ada)).toBe(false);
    expect(await exists(id)).toBe(true);
  });
});
