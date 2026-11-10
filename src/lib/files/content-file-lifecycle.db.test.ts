import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Media a document embeds, then drops, through the real save path against
 * a real Postgres: removed media kept for Restore never fills the 20-file
 * limit, history pruning deletes it once no version names it, and many
 * links to files the save cannot use never fail a save or a Restore. R2 is
 * mocked at its boundary. It runs only when TEST_DATABASE_URL names a
 * throwaway local database with the migrations applied (`pnpm db:migrate`);
 * never point it at a shared one. Every case starts from fresh uploads and
 * an empty history (beforeEach), so each one runs on its own.
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
  const { attachFiles } = await import("./attach");
  const { deleteUnnamedContentFiles, pruneUnusedContentFiles } = await import("./icon-cleanup");

  const tag = randomUUID().slice(0, 8);
  const author = `lifecycle-${tag}-author`;
  const doc = `lifecycle-${tag}-doc`;
  const board = `lifecycle-${tag}-ui`;
  const report = randomUUID();
  const twoYearsOn = () => new Date(Date.now() + 2 * 365 * 86_400_000);
  const uiWithFile = (fileId: string | null) =>
    JSON.stringify({ root: "page", elements: { page: { type: "Stack", props: {}, children: fileId ? ["intro", "file"] : ["intro"] }, intro: { type: "Text", props: { text: "Board pack" } }, ...(fileId ? { file: { type: "File", props: { file: fileId } } } : {}) } });
  const shots = Array.from({ length: 25 }, () => randomUUID());
  const embed = (fileId: string) => `# Weekly report\n\n![Screenshot](/api/files/${fileId})\n`;

  async function attachedIds(artifactId = doc) {
    const rows = await getDb().select({ id: artifactFile.id }).from(artifactFile).where(eq(artifactFile.artifactId, artifactId));
    return rows.map((row) => row.id);
  }

  async function versionIds() {
    const rows = await getDb().select({ id: artifactVersion.id, content: artifactVersion.content }).from(artifactVersion).where(eq(artifactVersion.artifactId, doc));
    return rows;
  }

  /** Saves the document once per screenshot, each replacing the one before. */
  async function swapEveryScreenshot() {
    for (const shot of shots) {
      await expect(updateArtifact(author, doc, { content: embed(shot) })).resolves.not.toBeNull();
    }
  }

  async function clearCase() {
    const db = getDb();
    await db.delete(artifactFile).where(inArray(artifactFile.id, [...shots, report]));
    await db.delete(artifactVersion).where(inArray(artifactVersion.artifactId, [doc, board]));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%${author}%`));
  }

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values({ id: author, name: author, email: `${author}@example.com` });
    const base = { userId: author, updatedBy: author, visibility: "private" as const };
    await db.insert(artifact).values([
      { ...base, id: doc, kind: "markdown", title: "Weekly report", content: "# Weekly report\n", shareId: randomUUID().replaceAll("-", ""), publicId: generatePublicId() },
      { ...base, id: board, kind: "ui", title: "Board pack", content: uiWithFile(null), shareId: randomUUID().replaceAll("-", ""), publicId: generatePublicId() },
    ]);
  });

  beforeEach(async () => {
    await clearCase();
    await getDb().update(artifact).set({ content: "# Weekly report\n" }).where(eq(artifact.id, doc));
    await getDb().update(artifact).set({ content: uiWithFile(null) }).where(eq(artifact.id, board));
    await getDb().insert(artifactFile).values([
      ...shots.map((id) => ({ id, uploaderId: author, key: `files/${id}/shot.png`, filename: "shot.png", contentType: "image/png", size: 10, status: "ready" as const })),
      { id: report, uploaderId: author, key: `files/${report}/report.pdf`, filename: "report.pdf", contentType: "application/pdf", size: 10, status: "ready" as const },
    ]);
    r2.deleted.length = 0;
  });

  afterAll(async () => {
    const db = getDb();
    await clearCase();
    await db.delete(artifact).where(inArray(artifact.id, [doc, board]));
    await db.delete(user).where(eq(user.id, author));
  });

  it("should keep saving when the author swaps the screenshot 25 times, keeping each old one for Restore", async () => {
    await swapEveryScreenshot();
    expect((await attachedIds()).sort()).toEqual([...shots].sort());
    // Each swap drops a shown file, so it files its own version: every old screenshot is still restorable.
    expect((await versionIds()).length).toBeGreaterThanOrEqual(shots.length);
  });

  it("should restore an old screenshot, and save links to 60 files it cannot use", async () => {
    await swapEveryScreenshot();
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
    await updateArtifact(author, doc, { content: embed(shot) });
    await updateArtifact(author, doc, { content: embed(shots[3] ?? "") });
    await getDb().delete(artifactVersion).where(eq(artifactVersion.artifactId, doc));
    await getDb().insert(artifactVersion).values({ id: randomUUID(), artifactId: doc, title: "Weekly report", kind: "markdown", content: embed(shot.toUpperCase()), createdBy: author });
    await expect(pruneUnusedContentFiles(doc, [shot])).resolves.toBe(0);
    expect(await attachedIds()).toContain(shot);
  });

  it("should delete a removed screenshot with the save that drops it when no kept version names it any more", async () => {
    const [first, second] = shots;
    await updateArtifact(author, doc, { content: embed(first ?? "") });
    // As if history pruning already dropped the version that showed it.
    await getDb().update(artifactVersion).set({ content: "# Weekly report\n" }).where(eq(artifactVersion.artifactId, doc));
    await updateArtifact(author, doc, { content: embed(second ?? "") });
    expect(r2.deleted).toEqual([`files/${first ?? ""}/shot.png`]);
    expect(await attachedIds()).toEqual([second]);
  });

  it("should delete removed screenshots once history pruning drops the last version that showed them", async () => {
    await swapEveryScreenshot();
    const current = shots[24] ?? "";
    // Two years on, retention keeps only the newest version, and the rest go with the versions that showed them.
    await pruneArtifactVersions(doc, twoYearsOn());
    expect(await attachedIds()).toEqual([current]);
    expect(r2.deleted).toHaveLength(shots.length - 1);
  });

  it("should never delete a file attached with files_attach after the document linked it and then dropped the link", async () => {
    await attachFiles(author, doc, [report], "agent");
    await updateArtifact(author, doc, { content: `# Weekly report\n\nSee [the report](/api/files/${report}).\n` });
    await updateArtifact(author, doc, { content: "# Weekly report\n\nNo report this week.\n" });
    await pruneArtifactVersions(doc, twoYearsOn());
    expect(await attachedIds()).toEqual([report]);
    expect(r2.deleted).toEqual([]);
  });

  it("should never delete a file attached with files_attach after a ui File block used it and was removed", async () => {
    await attachFiles(author, board, [report], "person");
    await updateArtifact(author, board, { content: uiWithFile(report) });
    await updateArtifact(author, board, { content: uiWithFile(null) });
    await pruneArtifactVersions(board, twoYearsOn());
    expect(await attachedIds(board)).toEqual([report]);
    expect(r2.deleted).toEqual([]);
  });

  it("should still delete an editor upload the document brought in, once it is removed and pruned", async () => {
    const [shot] = shots;
    await updateArtifact(author, doc, { content: embed(shot ?? "") });
    await updateArtifact(author, doc, { content: "# Weekly report\n\nScreenshot removed.\n" });
    await pruneArtifactVersions(doc, twoYearsOn());
    expect(await attachedIds()).toEqual([]);
    expect(r2.deleted).toEqual([`files/${shot ?? ""}/shot.png`]);
  });

  it("should keep a file when a save has already written content naming it, even with no version naming it yet", async () => {
    const [shot] = shots;
    await updateArtifact(author, doc, { content: embed(shot ?? "") });
    // A Restore between its file check and its version write: the artifact names the file, no version does.
    await getDb().delete(artifactVersion).where(eq(artifactVersion.artifactId, doc));
    await expect(deleteUnnamedContentFiles(doc, [shot ?? ""])).resolves.toEqual([]);
    expect(await attachedIds()).toEqual([shot]);
  });
});
