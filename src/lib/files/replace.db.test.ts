import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
/*
 * Replacing a file against a real Postgres, through the same functions the
 * Files section, files_replace, /api/files, and History use: the entry keeps
 * its id and place, the old object becomes a copy that History keeps for
 * editors, readers get only what their version showed, retention and
 * deletion take the copies with them, and a refused replace changes
 * nothing. R2 is stubbed at its boundary. It runs only when
 * TEST_DATABASE_URL names a throwaway local database with the migrations
 * applied (`pnpm db:migrate`); never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

const r2 = vi.hoisted(() => ({ deleted: [] as string[], refuse: new Set<string>() }));
vi.mock("./r2", () => ({
  r2ConfigFromEnv: () => ({}),
  deleteObject: (_config: unknown, key: string) => {
    if (r2.refuse.has(key)) return Promise.reject(new Error("R2 refused the delete."));
    r2.deleted.push(key);
    return Promise.resolve();
  },
}));

describe.runIf(Boolean(databaseUrl))("replacing a file, with a database", async () => {
  const { eq, inArray, like, or, sql } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifactFileCopy } = await import("@/db/file-copy-schema");
  const { artifact, artifactFile, artifactVersion, rateLimitBucket, user } = await import("@/db/schema");
  const { getArtifactAccess } = await import("@/lib/access");
  const { deleteArtifact } = await import("@/lib/artifacts");
  const { generatePublicId } = await import("@/lib/public-id");
  const { fileBytesUsed } = await import("@/lib/quota/usage");
  const { insertVersion, pruneArtifactVersions } = await import("@/lib/versions/history");
  const { listArtifactVersions } = await import("@/lib/versions/history-queries");
  const { cleanupOrphanCopies, filesReplacedSince, findEditableCopy, pruneFileCopies } = await import("./copies");
  const { filesForViewer, findReadableFile } = await import("./download");
  const { replaceFile } = await import("./replace");
  const { deleteFileRows, removeAbandonedFiles, removeUnattachedUpload } = await import("./store");

  const tag = randomUUID().slice(0, 8);
  const ids = { author: `replace-${tag}-author`, stranger: `replace-${tag}-stranger`, doc: `replace-${tag}-doc` };
  const sow = randomUUID();
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
  const yearsAgo = (years: number) => new Date(Date.now() - years * 365 * 86_400_000);

  async function upload(uploaderId: string, filename = "sow-v2.pdf", options: { status?: "pending" | "ready"; contentType?: string } = {}) {
    const id = randomUUID();
    await getDb().insert(artifactFile).values({ id, uploaderId, key: `files/${id}/${filename}`, filename, contentType: options.contentType ?? "application/pdf", size: 20, status: options.status ?? "ready" });
    return id;
  }

  async function entry(fileId = sow) {
    const [row] = await getDb().select().from(artifactFile).where(eq(artifactFile.id, fileId));
    return row ?? null;
  }

  async function copies() {
    return getDb().select().from(artifactFileCopy).where(eq(artifactFileCopy.artifactId, ids.doc));
  }

  /** The copies oldest first. */
  async function copiesInOrder() {
    return (await copies()).sort((a, b) => a.replacedAt.getTime() - b.replacedAt.getTime());
  }

  /** Moves every time this case wrote back by `minutes`, keeping their order, as if it all happened that long ago. */
  async function shiftBack(minutes: number) {
    const shift = sql`make_interval(mins => ${minutes})`;
    const db = getDb();
    await db.update(artifactFileCopy).set({ replacedAt: sql`${artifactFileCopy.replacedAt} - ${shift}`, currentFrom: sql`${artifactFileCopy.currentFrom} - ${shift}` }).where(eq(artifactFileCopy.artifactId, ids.doc));
    await db.update(artifactVersion).set({ createdAt: sql`${artifactVersion.createdAt} - ${shift}`, savedAt: sql`${artifactVersion.savedAt} - ${shift}` }).where(eq(artifactVersion.artifactId, ids.doc));
    await db.update(artifactFile).set({ replacedAt: sql`${artifactFile.replacedAt} - ${shift}`, attachedAt: sql`${artifactFile.attachedAt} - ${shift}` }).where(eq(artifactFile.id, sow));
  }

  async function publicId() {
    const [row] = await getDb().select({ publicId: artifact.publicId }).from(artifact).where(eq(artifact.id, ids.doc));
    if (!row) throw new Error("No artifact.");
    return row.publicId;
  }

  async function publicFiles() {
    const viewable = await getArtifactAccess(await publicId(), null);
    return viewable ? filesForViewer(viewable) : [];
  }

  /** Files a version of the artifact as it is now, back-dated to `savedAt`. */
  async function versionAt(savedAt: Date) {
    const [record] = await getDb().select().from(artifact).where(eq(artifact.id, ids.doc));
    if (!record) throw new Error("No artifact.");
    return insertVersion(record, { createdBy: ids.author, saveKind: "files", at: savedAt });
  }

  async function serve(versionId: string | null) {
    await getDb().update(artifact).set({ approvedVersionId: versionId }).where(eq(artifact.id, ids.doc));
  }

  async function clearCase() {
    const db = getDb();
    await serve(null);
    await db.update(artifact).set({ icon: null }).where(eq(artifact.id, ids.doc));
    await db.delete(artifactFileCopy).where(or(eq(artifactFileCopy.artifactId, ids.doc), inArray(artifactFileCopy.uploaderId, [ids.author, ids.stranger])));
    await db.delete(artifactFile).where(inArray(artifactFile.uploaderId, [ids.author, ids.stranger]));
    await db.delete(artifactVersion).where(eq(artifactVersion.artifactId, ids.doc));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%replace-${tag}%`));
  }

  async function createDoc() {
    await getDb().insert(artifact).values({ id: ids.doc, userId: ids.author, updatedBy: ids.author, kind: "file", title: "Statement of work", content: "", visibility: "public", shareId: randomUUID().replaceAll("-", ""), publicId: generatePublicId() }).onConflictDoNothing();
  }

  beforeAll(async () => {
    await getDb().insert(user).values([ids.author, ids.stranger].map((id) => ({ id, name: id, email: `${id}@example.com` })));
  });

  /* Each case: a public file artifact holding sow.pdf, attached 30 minutes ago, with a version from then. */
  beforeEach(async () => {
    await clearCase();
    await createDoc();
    await getDb().insert(artifactFile).values({ id: sow, uploaderId: ids.author, artifactId: ids.doc, attachedAt: at(30), key: `files/${sow}/sow.pdf`, filename: "sow.pdf", contentType: "application/pdf", size: 10, status: "ready" });
    await versionAt(at(29));
    r2.deleted.length = 0;
    r2.refuse.clear();
  });

  afterAll(async () => {
    await clearCase();
    const db = getDb();
    await db.delete(artifact).where(eq(artifact.id, ids.doc));
    await db.delete(user).where(inArray(user.id, [ids.author, ids.stranger]));
  });

  it("should keep the entry's id, name, and place, keep the old copy, and show the replace in History", async () => {
    const next = await upload(ids.author);
    const result = await replaceFile(ids.author, { fileId: sow, uploadId: next }, "person");

    expect(result.file).toMatchObject({ id: sow, filename: "sow.pdf", size: 20 });
    expect((await entry())?.key).toBe(`files/${next}/sow-v2.pdf`);
    expect(await entry(next)).toBeNull();
    const [copy] = await copies();
    expect(copy).toMatchObject({ fileId: sow, key: `files/${sow}/sow.pdf`, filename: "sow.pdf", replacedBy: ids.author, currentFrom: null });
    const [latest] = await listArtifactVersions({ id: ids.doc, approvedVersionId: null });
    expect(latest).toMatchObject({ saveKind: "replace", replacedFile: "sow.pdf" });
    expect(r2.deleted).toEqual([]);
  });

  it("should offer the old copy in History for a version saved before the replace, and to editors only", async () => {
    const next = await upload(ids.author);
    await replaceFile(ids.author, { fileId: sow, uploadId: next }, "person");
    const [copy] = await copies();
    if (!copy) throw new Error("No copy.");

    expect((await filesReplacedSince(ids.doc, at(29))).map((file) => file.copyId)).toEqual([copy.id]);
    expect(await filesReplacedSince(ids.doc, new Date())).toEqual([]);
    expect((await findEditableCopy(sow, copy.id, ids.author))?.key).toBe(`files/${sow}/sow.pdf`);
    await expect(findEditableCopy(sow, copy.id, ids.stranger)).resolves.toBeNull();
    await expect(findEditableCopy(sow, copy.id, null)).resolves.toBeNull();
  });

  it("should serve the latest file to everyone who reads the latest version", async () => {
    const next = await upload(ids.author);
    await replaceFile(ids.author, { fileId: sow, uploadId: next }, "person");
    expect((await findReadableFile(sow, ids.author))?.key).toBe(`files/${next}/sow-v2.pdf`);
  });

  it("should serve readers outside the team the copy their approved version showed, and the new file once it is approved", async () => {
    const before = await versionAt(at(20));
    const next = await upload(ids.author);
    await replaceFile(ids.author, { fileId: sow, uploadId: next }, "person");
    await serve(before);

    expect((await findReadableFile(sow, ids.stranger))?.key).toBe(`files/${sow}/sow.pdf`);
    expect((await findReadableFile(sow, null))?.key).toBe(`files/${sow}/sow.pdf`);
    expect(await publicFiles()).toEqual([expect.objectContaining({ id: sow, filename: "sow.pdf", size: 10, replacedAt: null })]);
    // The author reads the latest version.
    expect((await findReadableFile(sow, ids.author))?.key).toBe(`files/${next}/sow-v2.pdf`);

    const [approved] = await listArtifactVersions({ id: ids.doc, approvedVersionId: null });
    await serve(approved?.id ?? null);
    expect((await findReadableFile(sow, null))?.key).toBe(`files/${next}/sow-v2.pdf`);
    expect(await publicFiles()).toEqual([expect.objectContaining({ id: sow, size: 20 })]);
  });

  it("should never hand readers outside the team a copy from a time their version does not show", async () => {
    const next = await upload(ids.author);
    await replaceFile(ids.author, { fileId: sow, uploadId: next }, "person");
    const later = await upload(ids.author, "sow-v3.pdf");
    await replaceFile(ids.author, { fileId: sow, uploadId: later }, "person");
    const [first, second] = (await copies()).sort((a, b) => a.replacedAt.getTime() - b.replacedAt.getTime());
    if (!first || !second) throw new Error("Two copies expected.");
    // Approve a version saved while the middle upload was current.
    const middle = await versionAt(new Date((first.replacedAt.getTime() + second.replacedAt.getTime()) / 2));
    await serve(middle);
    expect((await findReadableFile(sow, null))?.key).toBe(`files/${next}/sow-v2.pdf`);
    // A copy that is gone (deleted by hand here) is never replaced by a newer file for these readers.
    await getDb().delete(artifactFileCopy).where(eq(artifactFileCopy.id, second.id));
    await expect(findReadableFile(sow, null)).resolves.toBeNull();
    expect(await publicFiles()).toEqual([]);
  });

  /** Replaces sow.pdf, then moves time on a year and a half: the version from before the replace is past retention; the replace's own is the newest. */
  async function replacedLongAgo() {
    const next = await upload(ids.author);
    await replaceFile(ids.author, { fileId: sow, uploadId: next }, "person");
    const db = getDb();
    await db.update(artifactFileCopy).set({ replacedAt: yearsAgo(1.5) }).where(eq(artifactFileCopy.fileId, sow));
    await db.update(artifactFile).set({ attachedAt: yearsAgo(3), replacedAt: yearsAgo(1.5) }).where(eq(artifactFile.id, sow));
    const versions = await db.select().from(artifactVersion).where(eq(artifactVersion.artifactId, ids.doc));
    const before = versions.find((version) => version.saveKind === "files");
    const replace = versions.find((version) => version.saveKind === "replace");
    if (!before || !replace) throw new Error("Expected a version before the replace and the replace's own.");
    await db.update(artifactVersion).set({ createdAt: yearsAgo(2), savedAt: yearsAgo(2) }).where(eq(artifactVersion.id, before.id));
    await db.update(artifactVersion).set({ createdAt: yearsAgo(1.4), savedAt: yearsAgo(1.4) }).where(eq(artifactVersion.id, replace.id));
    return { next, before, replace };
  }

  it("should prune an old copy with the last version saved while it was current, and keep one the approved version shows", async () => {
    const { next, before, replace } = await replacedLongAgo();

    // Readers outside the team are served the version from before the replace: it and its copy stay.
    await serve(before.id);
    await pruneArtifactVersions(ids.doc);
    expect(await copies()).toHaveLength(1);
    expect((await findReadableFile(sow, null))?.key).toBe(`files/${sow}/sow.pdf`);

    await serve(replace.id);
    expect(await pruneArtifactVersions(ids.doc)).toBe(1);
    expect(await copies()).toEqual([]);
    expect(r2.deleted).toEqual([`files/${sow}/sow.pdf`]);
    expect((await entry())?.key).toBe(`files/${next}/sow-v2.pdf`);
  });

  it("should keep a pruned copy's row when R2 refuses to delete its object, and finish on the next prune", async () => {
    const { replace } = await replacedLongAgo();
    await serve(replace.id);
    r2.refuse.add(`files/${sow}/sow.pdf`);
    await pruneArtifactVersions(ids.doc);
    expect(await copies()).toHaveLength(1);

    r2.refuse.clear();
    await expect(pruneFileCopies(ids.doc)).resolves.toBe(1);
    expect(await copies()).toEqual([]);
    expect(r2.deleted).toEqual([`files/${sow}/sow.pdf`]);
  });

  it("should never hand out a later copy as the file from before when the copy from then is gone", async () => {
    const before = await versionAt(at(20));
    await replaceFile(ids.author, { fileId: sow, uploadId: await upload(ids.author) }, "person");
    await replaceFile(ids.author, { fileId: sow, uploadId: await upload(ids.author, "sow-v3.pdf") }, "person");
    const [first] = (await copies()).sort((a, b) => a.replacedAt.getTime() - b.replacedAt.getTime());
    if (!first) throw new Error("No copy.");
    // The copy current at minute 20 (the original sow.pdf) is gone; the next one only became current later.
    await getDb().delete(artifactFileCopy).where(eq(artifactFileCopy.id, first.id));
    await serve(before);
    await expect(findReadableFile(sow, null)).resolves.toBeNull();
    expect(await publicFiles()).toEqual([]);
    expect(await filesReplacedSince(ids.doc, at(20))).toEqual([]);
  });

  it("should never serve a newer copy when the approved version's copy is gone, with three replaces", async () => {
    await replaceFile(ids.author, { fileId: sow, uploadId: await upload(ids.author, "sow-v2.pdf") }, "person");
    await replaceFile(ids.author, { fileId: sow, uploadId: await upload(ids.author, "sow-v3.pdf") }, "person");
    await replaceFile(ids.author, { fileId: sow, uploadId: await upload(ids.author, "sow-v4.pdf") }, "person");
    const [, v2, v3] = await copiesInOrder();
    if (!v2 || !v3) throw new Error("Three copies expected.");
    // Approve a version saved while v2 was current, then lose v2's copy.
    await serve(await versionAt(new Date((v2.replacedAt.getTime() + (v2.currentFrom ?? v2.replacedAt).getTime()) / 2)));
    expect((await findReadableFile(sow, null))?.key).toBe(v2.key);
    await getDb().delete(artifactFileCopy).where(eq(artifactFileCopy.id, v2.id));
    await expect(findReadableFile(sow, null)).resolves.toBeNull();
    expect(await publicFiles()).toEqual([]);
    expect((await findReadableFile(sow, ids.author))?.key).not.toBe(v3.key);
  });

  it("should file the replace's version in the same statement, so quick replaces keep every upload through pruning", async () => {
    await replaceFile(ids.author, { fileId: sow, uploadId: await upload(ids.author, "sow-a.pdf") }, "person");
    await replaceFile(ids.author, { fileId: sow, uploadId: await upload(ids.author, "sow-b.pdf") }, "person");
    const [first, second] = await copiesInOrder();
    if (!first?.versionId || !second?.versionId) throw new Error("Each copy names its replace's version.");
    const [version] = await getDb().select().from(artifactVersion).where(eq(artifactVersion.id, first.versionId));
    // The version that made sow-a current is saved at that very moment, inside the window sow-a was current.
    expect(version?.savedAt.getTime()).toBe(first.replacedAt.getTime());
    expect(second.currentFrom?.getTime()).toBe(first.replacedAt.getTime());
    await shiftBack(10);
    await expect(pruneFileCopies(ids.doc)).resolves.toBe(0);
    expect(await copies()).toHaveLength(2);
  });

  it("should leave an upload the cleanup job picked alone when a replace used it before the job deleted it", async () => {
    const next = await upload(ids.author);
    await getDb().update(artifactFile).set({ createdAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(artifactFile.id, next));
    // The job picked the old, unattached upload; then a replace put it in the artifact.
    await replaceFile(ids.author, { fileId: sow, uploadId: next }, "person");
    await expect(removeAbandonedFiles([next, sow])).resolves.toBe(0);
    expect((await entry())?.key).toBe(`files/${next}/sow-v2.pdf`);
    expect(r2.deleted).toEqual([]);
  });

  it("should delete the object a file holds when it is deleted, even when a replace swapped it after the file was read", async () => {
    const stale = await entry();
    const next = await upload(ids.author);
    await replaceFile(ids.author, { fileId: sow, uploadId: next }, "person");
    // A delete that read the file before the replace: the row it deletes names the new object.
    expect(stale?.key).toBe(`files/${sow}/sow.pdf`);
    expect((await deleteFileRows(eq(artifactFile.id, sow))).map((row) => row.key)).toEqual([`files/${next}/sow-v2.pdf`]);
    expect(r2.deleted).toEqual([`files/${next}/sow-v2.pdf`]);
    // The old copy lost its file; the cleanup job removes it with its object.
    await cleanupOrphanCopies();
    expect(await copies()).toEqual([]);
    expect(r2.deleted).toContain(`files/${sow}/sow.pdf`);
  });

  it("should delete the file and every old copy with the artifact", async () => {
    const next = await upload(ids.author);
    await replaceFile(ids.author, { fileId: sow, uploadId: next }, "person");
    expect(await deleteArtifact(ids.author, ids.doc)).toBe(true);
    expect(await entry()).toBeNull();
    expect(await getDb().select().from(artifactFileCopy).where(eq(artifactFileCopy.fileId, sow))).toEqual([]);
    expect(r2.deleted.sort()).toEqual([`files/${next}/sow-v2.pdf`, `files/${sow}/sow.pdf`].sort());
    await createDoc();
  });

  it("should count old copies toward the uploader's file storage", async () => {
    const before = await fileBytesUsed(ids.author);
    const next = await upload(ids.author);
    expect(await fileBytesUsed(ids.author)).toBe(before + 20);
    await replaceFile(ids.author, { fileId: sow, uploadId: next }, "person");
    // The new file (20) is the entry now, and the old one (10) is still kept.
    expect(await fileBytesUsed(ids.author)).toBe(before + 20);
  });

  it("should leave the current file as it was when the upload is not finished, and let the page discard it", async () => {
    const pending = await upload(ids.author, "sow-v2.pdf", { status: "pending" });
    await expect(replaceFile(ids.author, { fileId: sow, uploadId: pending }, "person")).rejects.toThrow(/still uploading/);
    expect((await entry())?.key).toBe(`files/${sow}/sow.pdf`);
    expect(await copies()).toEqual([]);
    expect(await removeUnattachedUpload(pending, ids.author)).toBe(true);
    expect(r2.deleted).toEqual([`files/${pending}/sow-v2.pdf`]);
  });

  it("should refuse to replace media a document embeds, and leave the file and upload as they were", async () => {
    const next = await upload(ids.author);
    await getDb().update(artifactFile).set({ attachedByContent: true }).where(eq(artifactFile.id, sow));
    await expect(replaceFile(ids.author, { fileId: sow, uploadId: next }, "person")).rejects.toThrow(/shown in the document/);
    expect((await entry())?.key).toBe(`files/${sow}/sow.pdf`);
    expect(await entry(next)).not.toBeNull();
    expect(await copies()).toEqual([]);
  });

  it("should keep one consistent file when two replaces race, and leave the losing upload untouched", async () => {
    const first = await upload(ids.author, "sow-a.pdf");
    const second = await upload(ids.author, "sow-b.pdf");
    const results = await Promise.allSettled([
      replaceFile(ids.author, { fileId: sow, uploadId: first }, "person"),
      replaceFile(ids.author, { fileId: sow, uploadId: second }, "person"),
    ]);
    const won = results.filter((result) => result.status === "fulfilled").length;
    expect(won).toBeGreaterThanOrEqual(1);
    const kept = await copies();
    // Every replace that worked made exactly one copy, and the copies chain from the first file.
    expect(kept).toHaveLength(won);
    expect(kept.map((copy) => copy.key)).toContain(`files/${sow}/sow.pdf`);
    const key = (await entry())?.key;
    expect([`files/${first}/sow-a.pdf`, `files/${second}/sow-b.pdf`]).toContain(key);
    if (won === 1) {
      const loser = key === `files/${first}/sow-a.pdf` ? second : first;
      expect(await entry(loser)).not.toBeNull();
    }
    expect(r2.deleted).toEqual([]);
  });

  it("should refuse a replace from another artifact's page", async () => {
    const next = await upload(ids.author);
    await expect(replaceFile(ids.author, { fileId: sow, uploadId: next, artifactId: "some-other-artifact" }, "person")).rejects.toThrow("File not found.");
    expect((await entry())?.key).toBe(`files/${sow}/sow.pdf`);
  });

  it("should keep the new file when the page's discard arrives after a replace that worked", async () => {
    const next = await upload(ids.author);
    await replaceFile(ids.author, { fileId: sow, uploadId: next }, "person");
    expect(await removeUnattachedUpload(next, ids.author)).toBe(false);
    expect((await entry())?.key).toBe(`files/${next}/sow-v2.pdf`);
    expect(r2.deleted).toEqual([]);
  });

  it("should refuse someone who cannot edit the artifact, with the same answer as an unknown file", async () => {
    const theirs = await upload(ids.stranger);
    await expect(replaceFile(ids.stranger, { fileId: sow, uploadId: theirs }, "person")).rejects.toThrow("File not found.");
    await expect(replaceFile(ids.stranger, { fileId: randomUUID(), uploadId: theirs }, "person")).rejects.toThrow("File not found.");
    expect((await entry())?.key).toBe(`files/${sow}/sow.pdf`);
    expect(await copies()).toEqual([]);
  });

  it("should refuse an upload that is someone else's", async () => {
    const theirs = await upload(ids.stranger);
    await expect(replaceFile(ids.author, { fileId: sow, uploadId: theirs }, "person")).rejects.toThrow(/not yours/);
    expect((await entry())?.key).toBe(`files/${sow}/sow.pdf`);
    expect(await entry(theirs)).not.toBeNull();
  });
});
