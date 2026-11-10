import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Media a document embeds, then drops, through the real save path against
 * a real Postgres: removed media kept for Restore never fills the 20-file
 * limit, history pruning deletes it once no version names it, and many
 * links to files the save cannot use never fail a save or a Restore. R2 is
 * mocked at its boundary. It runs only when TEST_DATABASE_URL names a
 * throwaway local database with the migrations applied (`pnpm db:migrate`);
 * never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

const r2 = vi.hoisted(() => ({ deleted: [] as string[] }));
vi.mock("./r2", () => ({
  r2ConfigFromEnv: () => ({}),
  deleteObject: (_config: unknown, key: string) => {
    r2.deleted.push(key);
    return Promise.resolve();
  },
}));

describe.runIf(Boolean(databaseUrl))("embedded media over time, with a database", async () => {
  const { eq, inArray, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, artifactFile, artifactVersion, rateLimitBucket, user } = await import("@/db/schema");
  const { generatePublicId } = await import("@/lib/public-id");
  const { restoreArtifactVersion, updateArtifact } = await import("@/lib/artifacts");
  const { pruneArtifactVersions } = await import("@/lib/versions/history");
  const { pruneUnusedContentFiles } = await import("./icon-cleanup");

  const tag = randomUUID().slice(0, 8);
  const author = `lifecycle-${tag}-author`;
  const doc = `lifecycle-${tag}-doc`;
  const shots = Array.from({ length: 25 }, () => randomUUID());
  const embed = (fileId: string) => `# Weekly report\n\n![Screenshot](/api/files/${fileId})\n`;

  async function attachedIds() {
    const rows = await getDb().select({ id: artifactFile.id }).from(artifactFile).where(eq(artifactFile.artifactId, doc));
    return rows.map((row) => row.id);
  }

  async function versionIds() {
    const rows = await getDb().select({ id: artifactVersion.id, content: artifactVersion.content }).from(artifactVersion).where(eq(artifactVersion.artifactId, doc));
    return rows;
  }

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values({ id: author, name: author, email: `${author}@example.com` });
    await db.insert(artifact).values({ id: doc, userId: author, updatedBy: author, kind: "markdown", title: "Weekly report", content: "# Weekly report\n", visibility: "private", shareId: randomUUID().replaceAll("-", ""), publicId: generatePublicId() });
    await db.insert(artifactFile).values(shots.map((id) => ({ id, uploaderId: author, key: `files/${id}/shot.png`, filename: "shot.png", contentType: "image/png", size: 10, status: "ready" as const })));
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifactFile).where(inArray(artifactFile.id, shots));
    await db.delete(artifactVersion).where(eq(artifactVersion.artifactId, doc));
    await db.delete(artifact).where(eq(artifact.id, doc));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%${author}%`));
    await db.delete(user).where(eq(user.id, author));
  });

  it("should keep saving when the author swaps the screenshot 25 times, keeping each old one for Restore", async () => {
    for (const shot of shots) {
      await expect(updateArtifact(author, doc, { content: embed(shot) })).resolves.not.toBeNull();
    }
    expect((await attachedIds()).sort()).toEqual([...shots].sort());
    // Each swap drops a shown file, so it files its own version: every old screenshot is still restorable.
    expect((await versionIds()).length).toBeGreaterThanOrEqual(shots.length);
  });

  it("should restore an old screenshot, and save links to 60 files it cannot use", async () => {
    const [first] = (await versionIds()).filter((version) => version.content.includes(shots[0] ?? "none"));
    if (!first) throw new Error("No version with the first screenshot.");
    await expect(restoreArtifactVersion(author, doc, first.id)).resolves.not.toBeNull();
    const links = Array.from({ length: 60 }, () => `- [Spec](/api/files/${randomUUID()})`).join("\n");
    const linked = `${embed(shots[0] ?? "")}\n${links}\n`;
    await expect(updateArtifact(author, doc, { content: linked })).resolves.not.toBeNull();
    const [withLinks] = (await versionIds()).filter((version) => version.content === linked);
    if (!withLinks) throw new Error("No version with the links.");
    await updateArtifact(author, doc, { content: embed(shots[1] ?? "") });
    await expect(restoreArtifactVersion(author, doc, withLinks.id)).resolves.not.toBeNull();
  });

  it("should keep a removed screenshot that a version names in capitals", async () => {
    const shot = shots[2] ?? "";
    await getDb().delete(artifactVersion).where(eq(artifactVersion.artifactId, doc));
    await getDb().insert(artifactVersion).values({ id: randomUUID(), artifactId: doc, title: "Weekly report", kind: "markdown", content: embed(shot.toUpperCase()), createdBy: author });
    await expect(pruneUnusedContentFiles(doc, [shot])).resolves.toBe(0);
    expect(await attachedIds()).toContain(shot);
  });

  it("should delete removed screenshots once history pruning drops the last version that showed them", async () => {
    const current = shots[24] ?? "";
    r2.deleted.length = 0;
    // This save drops the restored screenshot, which no kept version names any more: it goes now.
    await updateArtifact(author, doc, { content: embed(current) });
    expect(r2.deleted).toEqual([`files/${shots[0] ?? ""}/shot.png`]);
    // Two years on, retention keeps only the newest version, and the rest go with the versions that showed them.
    await pruneArtifactVersions(doc, new Date(Date.now() + 2 * 365 * 86_400_000));
    expect(await attachedIds()).toEqual([current]);
    expect(r2.deleted).toHaveLength(shots.length - 1);
  });
});
