import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Page files against a real Postgres, through the functions files_attach,
 * files_replace, the page's address, and the page host's route use: an
 * upload requested as a page file attaches only as one, only to an HTML
 * artifact its uploader may edit; the limits and one-file-per-path hold in
 * the statement itself; and a reader of an approved version never gets a
 * file, or a newer copy of one, that version did not have. R2 is stubbed
 * at its boundary. It runs only when TEST_DATABASE_URL names a throwaway
 * local database with the migrations applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

vi.mock("@/lib/files/r2", () => ({ r2ConfigFromEnv: () => ({}), deleteObject: () => Promise.resolve() }));

describe.runIf(Boolean(databaseUrl))("page files, with a database", async () => {
  const { eq, inArray, like, or } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifactFileCopy } = await import("@/db/file-copy-schema");
  const { artifact, artifactFile, artifactVersion, rateLimitBucket, user } = await import("@/db/schema");
  const { getArtifactAccess } = await import("@/lib/access");
  const { attachFiles } = await import("@/lib/files/attach");
  const { filesForViewer } = await import("@/lib/files/download");
  const { replaceFile } = await import("@/lib/files/replace");
  const { attachFileRows, countArtifactFiles } = await import("@/lib/files/store");
  const { pageLabelFor } = await import("@/lib/page-host/rules");
  const { generatePublicId } = await import("@/lib/public-id");
  const { insertVersion } = await import("@/lib/versions/history");
  const { pageAddressFor } = await import("./address");
  const { pageFileLimits } = await import("./rules");
  const { attachPageFileRows, attachPageFilesWithinLimits, findPageFile, pageFileTotals } = await import("./store");
  const { openPageToken } = await import("./token");

  const tag = randomUUID().slice(0, 8);
  const ids = { author: `pagefiles-${tag}-author`, stranger: `pagefiles-${tag}-stranger`, page: `pagefiles-${tag}-page`, other: `pagefiles-${tag}-other`, doc: `pagefiles-${tag}-doc` };
  const artifactIds = [ids.page, ids.other, ids.doc];
  const secret = "page-files-db-test-secret-0123456789abcdef";
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

  /** A finished upload in no artifact, requested as a page file when `pagePath` is given. */
  async function upload(uploaderId: string, pagePath: string | null, options: { size?: number; contentType?: string } = {}) {
    const id = randomUUID();
    const filename = pagePath === null ? "notes.pdf" : pagePath.slice(pagePath.lastIndexOf("/") + 1);
    await getDb().insert(artifactFile).values({ id, uploaderId, key: `files/${id}/${filename}`, filename, contentType: options.contentType ?? (pagePath === null ? "application/pdf" : "text/css"), size: options.size ?? 10, status: "ready", pagePath });
    return id;
  }

  /** A page file already in an artifact since `attachedAt`. */
  async function held(artifactId: string, pagePath: string, options: { size?: number; contentType?: string; attachedAt?: Date } = {}) {
    const id = await upload(ids.author, pagePath, options);
    await getDb().update(artifactFile).set({ artifactId, attachedAt: options.attachedAt ?? at(30) }).where(eq(artifactFile.id, id));
    return id;
  }

  async function row(fileId: string) {
    const [found] = await getDb().select().from(artifactFile).where(eq(artifactFile.id, fileId));
    if (!found) throw new Error("No file row.");
    return found;
  }

  async function publicIdOf(artifactId: string) {
    const [found] = await getDb().select({ publicId: artifact.publicId }).from(artifact).where(eq(artifact.id, artifactId));
    if (!found) throw new Error("No artifact.");
    return found.publicId;
  }

  /** Files a version of the artifact as it is now, back-dated to `savedAt`, and serves it to readers who cannot edit. */
  async function approveAt(artifactId: string, savedAt: Date) {
    const [record] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId));
    if (!record) throw new Error("No artifact.");
    const versionId = await insertVersion(record, { createdBy: ids.author, saveKind: "files", at: savedAt });
    await getDb().update(artifact).set({ approvedVersionId: versionId }).where(eq(artifact.id, artifactId));
    return versionId;
  }

  /** What the address's token grants, read as the page host reads it. */
  async function granted(artifactId: string, viewerId: string | null, versionId?: string) {
    const publicId = await publicIdOf(artifactId);
    const address = await pageAddressFor({ pageKey: publicId, ...(versionId === undefined ? {} : { versionId }) }, viewerId);
    return address ? openPageToken(address.token, await pageLabelFor(publicId), new Date(), secret) : null;
  }

  async function clearCase() {
    const db = getDb();
    await db.update(artifact).set({ approvedVersionId: null }).where(inArray(artifact.id, artifactIds));
    await db.delete(artifactFileCopy).where(or(inArray(artifactFileCopy.artifactId, artifactIds), inArray(artifactFileCopy.uploaderId, [ids.author, ids.stranger])));
    await db.delete(artifactFile).where(inArray(artifactFile.uploaderId, [ids.author, ids.stranger]));
    await db.delete(artifactVersion).where(inArray(artifactVersion.artifactId, artifactIds));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%pagefiles-${tag}%`));
  }

  beforeAll(async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    const db = getDb();
    await db.insert(user).values([ids.author, ids.stranger].map((id) => ({ id, name: id, email: `${id}@example.com` })));
    const page = (id: string, kind: "html" | "markdown", visibility: "private" | "public") => ({ id, userId: ids.author, updatedBy: ids.author, kind, title: id, content: kind === "html" ? "<!doctype html><title>Page</title>" : "Notes", visibility, shareId: randomUUID().replaceAll("-", ""), publicId: generatePublicId() });
    await db.insert(artifact).values([page(ids.page, "html", "public"), page(ids.other, "html", "private"), page(ids.doc, "markdown", "private")]);
  });

  beforeEach(clearCase);

  afterAll(async () => {
    await clearCase();
    const db = getDb();
    await db.delete(artifact).where(inArray(artifact.id, artifactIds));
    await db.delete(user).where(inArray(user.id, [ids.author, ids.stranger]));
    vi.unstubAllEnvs();
  });

  describe("attaching", () => {
    it("should attach an upload requested as a page file to an HTML artifact, with its path, and file a version", async () => {
      const css = await upload(ids.author, "css/site.css");
      const saved = await attachFiles(ids.author, ids.other, [css], "person");
      expect(saved?.id).toBe(ids.other);
      expect(await row(css)).toMatchObject({ artifactId: ids.other, pagePath: "css/site.css", attachedByContent: false });
      expect(await pageFileTotals(ids.other)).toEqual({ count: 1, bytes: 10 });
      const versions = await getDb().select({ id: artifactVersion.id }).from(artifactVersion).where(eq(artifactVersion.artifactId, ids.other));
      expect(versions.length).toBeGreaterThan(0);
    });

    it("should attach page files and plain files in one call, each under its own rules", async () => {
      const css = await upload(ids.author, "css/site.css");
      const pdf = await upload(ids.author, null);
      await attachFiles(ids.author, ids.other, [css, pdf], "person");
      expect((await row(css)).artifactId).toBe(ids.other);
      expect((await row(pdf)).artifactId).toBe(ids.other);
      // Page files do not use up the plain attachments' limit.
      expect(await countArtifactFiles(ids.other)).toEqual({ plain: 1, inline: 0 });
    });

    it("should refuse a page file for an artifact that is not HTML, in the check and in the statement", async () => {
      const css = await upload(ids.author, "css/site.css");
      await expect(attachFiles(ids.author, ids.doc, [css], "person")).rejects.toThrow("Page files belong to an HTML artifact");
      expect(await attachPageFileRows(ids.author, ids.doc, [css])).toEqual([]);
      expect((await row(css)).artifactId).toBeNull();
    });

    it("should never attach an upload requested as a page file as a plain file", async () => {
      const script = await upload(ids.author, "js/app.js", { contentType: "text/javascript" });
      expect(await attachFileRows(ids.author, ids.doc, [script])).toBe(0);
      expect(await attachFileRows(ids.author, ids.other, [script])).toBe(0);
      expect(await attachFileRows(ids.author, ids.other, [script], { byContent: true })).toBe(0);
      expect((await row(script)).artifactId).toBeNull();
    });

    it("should refuse another person's upload, and a page file that is already in another artifact", async () => {
      const theirs = await upload(ids.stranger, "css/site.css");
      await expect(attachFiles(ids.author, ids.other, [theirs], "person")).rejects.toThrow("not yours to use here");
      expect(await attachPageFileRows(ids.author, ids.other, [theirs])).toEqual([]);
      expect((await row(theirs)).artifactId).toBeNull();

      const elsewhere = await held(ids.page, "css/site.css");
      await expect(attachFiles(ids.author, ids.other, [elsewhere], "person")).rejects.toThrow("not yours to use here");
      expect(await attachPageFileRows(ids.author, ids.other, [elsewhere])).toEqual([]);
      expect((await row(elsewhere)).artifactId).toBe(ids.page);
    });

    it("should refuse a second file at one path, and one that differs only by letter case, in the check and in the index", async () => {
      await held(ids.other, "img/Logo.png");
      const same = await upload(ids.author, "img/Logo.png");
      const cased = await upload(ids.author, "img/logo.png");
      await expect(attachFiles(ids.author, ids.other, [same], "person")).rejects.toThrow("already has a file at img/Logo.png");
      await expect(attachFiles(ids.author, ids.other, [cased], "person")).rejects.toThrow("already has a file at img/logo.png");
      await expect(attachPageFileRows(ids.author, ids.other, [same])).rejects.toThrow("cannot have the same path");
      await expect(attachPageFileRows(ids.author, ids.other, [cased])).rejects.toThrow("cannot have the same path");
      expect((await row(same)).artifactId).toBeNull();
      // The same path in another artifact is that artifact's own.
      expect(await attachPageFileRows(ids.author, ids.page, [same])).toEqual([same]);
    });
  });

  describe("limits", () => {
    it("should refuse, in the statement itself, a file that takes the artifact past the page file count", async () => {
      const db = getDb();
      const rows = Array.from({ length: pageFileLimits.maxFiles }, (_unused, index) => {
        const id = randomUUID();
        return { id, uploaderId: ids.author, artifactId: ids.other, attachedAt: at(30), key: `files/${id}/f.css`, filename: "f.css", contentType: "text/css", size: 1, status: "ready" as const, pagePath: `css/f${String(index)}.css` };
      });
      await db.insert(artifactFile).values(rows);
      const extra = await upload(ids.author, "css/extra.css");
      expect(await attachPageFileRows(ids.author, ids.other, [extra])).toEqual([]);
      await expect(attachFiles(ids.author, ids.other, [extra], "person")).rejects.toThrow("at most 100 page files");
      expect((await pageFileTotals(ids.other)).count).toBe(pageFileLimits.maxFiles);
    });

    it("should refuse, in the statement itself, a file that takes the artifact past the page file total, and take one that fits", async () => {
      await held(ids.other, "img/big.png", { size: pageFileLimits.maxTotalBytes - 100, contentType: "image/png" });
      const tooBig = await upload(ids.author, "img/more.png", { size: 101, contentType: "image/png" });
      const fits = await upload(ids.author, "img/small.png", { size: 100, contentType: "image/png" });
      expect(await attachPageFileRows(ids.author, ids.other, [tooBig])).toEqual([]);
      await expect(attachFiles(ids.author, ids.other, [tooBig], "person")).rejects.toThrow("The limit is 16 MB");
      // All or none: a batch that does not fit attaches nothing.
      expect(await attachPageFileRows(ids.author, ids.other, [fits, tooBig])).toEqual([]);
      expect(await attachPageFileRows(ids.author, ids.other, [fits])).toEqual([fits]);
      expect((await pageFileTotals(ids.other)).bytes).toBe(pageFileLimits.maxTotalBytes);
    });

    it("should never leave the artifact over a limit when two attaches land at one moment", async () => {
      await held(ids.other, "img/big.png", { size: pageFileLimits.maxTotalBytes - 100, contentType: "image/png" });
      const first = await upload(ids.author, "img/a.png", { size: 80, contentType: "image/png" });
      const second = await upload(ids.author, "img/b.png", { size: 80, contentType: "image/png" });
      await Promise.allSettled([attachPageFilesWithinLimits(ids.author, ids.other, [first]), attachPageFilesWithinLimits(ids.author, ids.other, [second])]);
      expect((await pageFileTotals(ids.other)).bytes).toBeLessThanOrEqual(pageFileLimits.maxTotalBytes);
    });
  });

  describe("what a viewer is served", () => {
    it("should find a page file by its exact path, in its own artifact only", async () => {
      const css = await held(ids.page, "css/site.css");
      expect((await findPageFile(ids.page, "css/site.css", null))?.id).toBe(css);
      expect(await findPageFile(ids.page, "css/Site.css", null)).toBeNull();
      expect(await findPageFile(ids.page, "site.css", null)).toBeNull();
      expect(await findPageFile(ids.other, "css/site.css", null)).toBeNull();
    });

    it("should never serve a pending upload, a plain attachment, or a file of an artifact that is not HTML", async () => {
      const pending = await held(ids.page, "css/pending.css");
      await getDb().update(artifactFile).set({ status: "pending" }).where(eq(artifactFile.id, pending));
      expect(await findPageFile(ids.page, "css/pending.css", null)).toBeNull();

      const plain = await upload(ids.author, null);
      await getDb().update(artifactFile).set({ artifactId: ids.page, attachedAt: at(30) }).where(eq(artifactFile.id, plain));
      expect(await findPageFile(ids.page, "notes.pdf", null)).toBeNull();

      // A row that could only exist if the artifact changed format after the attach.
      await held(ids.doc, "css/site.css");
      expect(await findPageFile(ids.doc, "css/site.css", null)).toBeNull();
    });

    it("should give a reader of the approved version no file that was attached after it", async () => {
      await held(ids.page, "css/site.css", { attachedAt: at(30) });
      await approveAt(ids.page, at(20));
      await held(ids.page, "js/later.js", { attachedAt: at(10) });

      const reader = await granted(ids.page, null);
      const signedIn = await granted(ids.page, ids.stranger);
      if (!reader?.asOf || !signedIn?.asOf) throw new Error("A reader of the approved version was given the latest files.");
      expect(signedIn.asOf.getTime()).toBe(reader.asOf.getTime());
      expect(await findPageFile(ids.page, "css/site.css", reader.asOf)).not.toBeNull();
      expect(await findPageFile(ids.page, "js/later.js", reader.asOf)).toBeNull();

      // The author is served the latest, and gets the later file.
      const author = await granted(ids.page, ids.author);
      expect(author).toMatchObject({ artifactId: ids.page, asOf: null });
      expect(await findPageFile(ids.page, "js/later.js", null)).not.toBeNull();

      // The Files list the reader gets agrees.
      const viewable = await getArtifactAccess(await publicIdOf(ids.page), null);
      const listed = viewable ? await filesForViewer(viewable) : [];
      expect(listed.map((file) => file.pagePath)).toEqual(["css/site.css"]);
    });

    it("should give a reader of the approved version the copy that was current then, never the newer one", async () => {
      const css = await held(ids.page, "css/site.css", { attachedAt: at(30) });
      const oldKey = (await row(css)).key;
      const approved = await approveAt(ids.page, at(20));
      const next = await upload(ids.author, "css/site.css", { size: 20 });
      const nextKey = (await row(next)).key;
      await replaceFile(ids.author, { fileId: css, uploadId: next }, "person");
      // As when the replace waits for approval: readers keep the version approved before it.
      await getDb().update(artifact).set({ approvedVersionId: approved }).where(eq(artifact.id, ids.page));
      const reader = await granted(ids.page, null);
      const asOf = reader?.asOf ?? null;
      expect(asOf).not.toBeNull();
      const served = await findPageFile(ids.page, "css/site.css", asOf);
      expect(served).toMatchObject({ id: css, key: oldKey, size: 10 });
      expect(served?.key).not.toBe(nextKey);
      // People who may edit get the new file at the same path.
      expect(await findPageFile(ids.page, "css/site.css", null)).toMatchObject({ id: css, key: nextKey, size: 20, pagePath: "css/site.css" });
    });

    it("should keep a reader's address the same when an edit they are not shown is saved", async () => {
      await held(ids.page, "css/site.css", { attachedAt: at(30) });
      await approveAt(ids.page, at(20));
      const publicId = await publicIdOf(ids.page);
      const now = new Date();
      const before = await pageAddressFor({ pageKey: publicId }, null, now);
      await getDb().update(artifact).set({ updatedAt: new Date() }).where(eq(artifact.id, ids.page));
      const after = await pageAddressFor({ pageKey: publicId }, null, now);
      expect(before).not.toBeNull();
      expect(after?.token).toBe(before?.token);
    });

    it("should make no address for someone who may not read the artifact, or for an artifact that is not HTML", async () => {
      expect(await granted(ids.other, null)).toBeNull();
      expect(await granted(ids.other, ids.stranger)).toBeNull();
      expect(await granted(ids.doc, ids.author)).toBeNull();
      expect(await pageAddressFor({ pageKey: "no-such-artifact" }, ids.author)).toBeNull();
      expect(await granted(ids.other, ids.author)).toMatchObject({ artifactId: ids.other, asOf: null });
    });

    it("should show a version in History with its own files to people who may edit, and to no one else", async () => {
      await held(ids.page, "css/site.css", { attachedAt: at(30) });
      const versionId = await approveAt(ids.page, at(20));
      const editor = await granted(ids.page, ids.author, versionId);
      expect(editor?.asOf?.getTime()).toBeLessThan(at(19).getTime());
      expect(await granted(ids.page, null, versionId)).toBeNull();
      expect(await granted(ids.page, ids.stranger, versionId)).toBeNull();
      expect(await granted(ids.page, ids.author, randomUUID())).toBeNull();
    });
  });

  describe("replacing", () => {
    it("should replace a page file only with an upload requested for the same path", async () => {
      const css = await held(ids.other, "css/site.css");
      const otherPath = await upload(ids.author, "css/other.css");
      const plain = await upload(ids.author, null);
      await expect(replaceFile(ids.author, { fileId: css, uploadId: otherPath }, "person")).rejects.toThrow("same pagePath");
      await expect(replaceFile(ids.author, { fileId: css, uploadId: plain }, "person")).rejects.toThrow("same pagePath");
      expect(await row(css)).toMatchObject({ pagePath: "css/site.css", size: 10 });

      const same = await upload(ids.author, "css/site.css", { size: 30 });
      const result = await replaceFile(ids.author, { fileId: css, uploadId: same }, "person");
      expect(result.file).toMatchObject({ id: css, pagePath: "css/site.css", size: 30 });
    });

    it("should never let an upload requested as a page file replace a plain attachment", async () => {
      const pdf = await upload(ids.author, null);
      await getDb().update(artifactFile).set({ artifactId: ids.other, attachedAt: at(30) }).where(eq(artifactFile.id, pdf));
      const script = await upload(ids.author, "js/app.js", { contentType: "text/javascript" });
      await expect(replaceFile(ids.author, { fileId: pdf, uploadId: script }, "person")).rejects.toThrow("requested as a page file");
      expect(await row(pdf)).toMatchObject({ contentType: "application/pdf", pagePath: null });
    });

    it("should refuse a replacement that takes the page files past their total", async () => {
      const big = await held(ids.other, "img/big.png", { size: pageFileLimits.maxTotalBytes - 100, contentType: "image/png" });
      const css = await held(ids.other, "css/site.css", { size: 50 });
      const larger = await upload(ids.author, "css/site.css", { size: 200 });
      await expect(replaceFile(ids.author, { fileId: css, uploadId: larger }, "person")).rejects.toThrow();
      expect(await row(css)).toMatchObject({ size: 50 });
      expect((await row(big)).artifactId).toBe(ids.other);
      expect((await pageFileTotals(ids.other)).bytes).toBeLessThanOrEqual(pageFileLimits.maxTotalBytes);
    });
  });
});
