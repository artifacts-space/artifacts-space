import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Publishing page files against a real Postgres: the one statement that
 * adds, replaces, and removes a page's files and files their version is
 * all or nothing, holds the page's limits and its access rules itself, and
 * runs only on the save its plan read. R2 is stubbed at its boundary. It
 * runs only when TEST_DATABASE_URL names a throwaway local database with
 * the migrations applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

const deleted: string[] = [];
vi.mock("@/lib/files/r2", () => ({
  r2ConfigFromEnv: () => ({}),
  deleteObject: (_config: unknown, key: string) => {
    deleted.push(key);
    return Promise.resolve();
  },
}));

describe.runIf(Boolean(databaseUrl))("publishing page files, with a database", async () => {
  const { and, eq, inArray, isNotNull, like, or } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifactFileCopy } = await import("@/db/file-copy-schema");
  const { artifact, artifactFile, artifactVersion, rateLimitBucket, user } = await import("@/db/schema");
  const { EditConflictError } = await import("@/lib/edits/conflict-error");
  const { generatePublicId } = await import("@/lib/public-id");
  const { insertVersion } = await import("@/lib/versions/history");
  const { planVersionedChangeApproval, prepareVersionedChange } = await import("@/lib/versions/service");
  const { publishPageFiles } = await import("./publish");
  const { isPublishRefusal, runPagePublish } = await import("./publish-statement");
  const { pageFileLimits } = await import("./rules");
  const { findPageFile, pageFileTotals } = await import("./store");

  const tag = randomUUID().slice(0, 8);
  const ids = { author: `publish-${tag}-author`, stranger: `publish-${tag}-stranger`, page: `publish-${tag}-page`, doc: `publish-${tag}-doc` };
  const artifactIds = [ids.page, ids.doc];
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

  /** A finished upload in no artifact, requested as a page file. */
  async function upload(uploaderId: string, pagePath: string, size = 10) {
    const id = randomUUID();
    const filename = pagePath.slice(pagePath.lastIndexOf("/") + 1);
    await getDb().insert(artifactFile).values({ id, uploaderId, key: `files/${id}/${filename}`, filename, contentType: "text/css", size, status: "ready", pagePath });
    return id;
  }

  /** A page file already in the page. */
  async function held(pagePath: string, size = 10, artifactId = ids.page) {
    const id = await upload(ids.author, pagePath, size);
    await getDb().update(artifactFile).set({ artifactId, attachedAt: at(30) }).where(eq(artifactFile.id, id));
    return id;
  }

  async function fileRow(fileId: string) {
    const [found] = await getDb().select().from(artifactFile).where(eq(artifactFile.id, fileId));
    return found ?? null;
  }

  async function page(artifactId = ids.page) {
    const [found] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId));
    if (!found) throw new Error("No artifact.");
    return found;
  }

  async function heldPaths(artifactId = ids.page) {
    const rows = await getDb().select({ pagePath: artifactFile.pagePath }).from(artifactFile).where(and(eq(artifactFile.artifactId, artifactId), isNotNull(artifactFile.pagePath)));
    return rows.map((row) => row.pagePath).sort();
  }

  async function fileVersions(artifactId = ids.page) {
    const rows = await getDb().select({ id: artifactVersion.id }).from(artifactVersion).where(and(eq(artifactVersion.artifactId, artifactId), eq(artifactVersion.saveKind, "files")));
    return rows.map((row) => row.id);
  }

  /** The statement's input for a change planned on the page as it is now, by the author. */
  async function change(parts: { addIds?: string[]; replaces?: { entryId: string; uploadId: string }[]; removeIds?: string[] }, artifactId = ids.page) {
    const before = await page(artifactId);
    const approval = await planVersionedChangeApproval(before, await prepareVersionedChange(before), ids.author, "person");
    return { before, approval, editorId: ids.author, actor: "person" as const, harness: null, versionId: randomUUID(), addIds: parts.addIds ?? [], replaces: parts.replaces ?? [], removeIds: parts.removeIds ?? [] };
  }

  async function clearCase() {
    const db = getDb();
    deleted.length = 0;
    await db.update(artifact).set({ approvedVersionId: null, icon: null }).where(inArray(artifact.id, artifactIds));
    await db.delete(artifactFileCopy).where(or(inArray(artifactFileCopy.artifactId, artifactIds), inArray(artifactFileCopy.uploaderId, [ids.author, ids.stranger])));
    await db.delete(artifactFile).where(inArray(artifactFile.uploaderId, [ids.author, ids.stranger]));
    await db.delete(artifactVersion).where(inArray(artifactVersion.artifactId, artifactIds));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%publish-${tag}%`));
  }

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([ids.author, ids.stranger].map((id) => ({ id, name: id, email: `${id}@example.com` })));
    const row = (id: string, kind: "html" | "markdown") => ({ id, userId: ids.author, updatedBy: ids.author, kind, title: id, content: kind === "html" ? "<!doctype html><title>Page</title>" : "Notes", visibility: "private" as const, shareId: randomUUID().replaceAll("-", ""), publicId: generatePublicId() });
    await db.insert(artifact).values([row(ids.page, "html"), row(ids.doc, "markdown")]);
  });

  beforeEach(clearCase);

  afterAll(async () => {
    await clearCase();
    const db = getDb();
    await db.delete(artifact).where(inArray(artifact.id, artifactIds));
    await db.delete(user).where(inArray(user.id, [ids.author, ids.stranger]));
  });

  describe("the statement", () => {
    it("should add, replace, and remove together, file one version at the save time, and stamp the artifact", async () => {
      const css = await held("css/site.css", 10);
      const old = await held("js/old.js", 20);
      const oldCssKey = (await fileRow(css))?.key;
      const oldJsKey = (await fileRow(old))?.key;
      const nextCss = await upload(ids.author, "css/site.css", 30);
      const nextCssKey = (await fileRow(nextCss))?.key;
      const app = await upload(ids.author, "js/app.js", 40);
      const planned = await change({ addIds: [app], replaces: [{ entryId: css, uploadId: nextCss }], removeIds: [old] });

      const landed = await runPagePublish(planned);
      if (!landed) throw new Error("The publish did not land.");

      expect(await heldPaths()).toEqual(["css/site.css", "js/app.js"]);
      // The replaced file keeps its id and path and holds the upload's object; the upload's own row is gone.
      expect(await fileRow(css)).toMatchObject({ id: css, pagePath: "css/site.css", key: nextCssKey, size: 30 });
      expect(await fileRow(nextCss)).toBeNull();
      expect(await fileRow(old)).toBeNull();
      expect(landed.removedKeys).toEqual([oldJsKey]);
      // What the replaced file held is an old copy, filed under this publish's version.
      const copies = await getDb().select().from(artifactFileCopy).where(eq(artifactFileCopy.fileId, css));
      expect(copies).toHaveLength(1);
      expect(copies[0]).toMatchObject({ key: oldCssKey, size: 10, versionId: planned.versionId });
      // One version, saved at the moment the artifact was stamped, later than the save the plan read.
      expect(await fileVersions()).toEqual([planned.versionId]);
      const after = await page();
      expect(after.updatedAt.getTime()).toBe(landed.savedAt.getTime());
      expect(after.updatedAt.getTime()).toBeGreaterThan(planned.before.updatedAt.getTime());
      expect((await fileRow(app))?.attachedAt?.getTime()).toBe(landed.savedAt.getTime());
      expect(await pageFileTotals(ids.page)).toEqual({ count: 2, bytes: 70 });
    });

    it("should change nothing when one part of the plan no longer holds: the removal in the same statement is undone too", async () => {
      const old = await held("js/old.js");
      const mine = await upload(ids.author, "js/app.js");
      const theirs = await upload(ids.stranger, "css/theirs.css");
      const planned = await change({ addIds: [mine, theirs], removeIds: [old] });

      const refusal = await runPagePublish(planned).then(() => null, (error: unknown) => error);
      expect(refusal, "another person's upload was published").not.toBeNull();
      expect(isPublishRefusal(refusal)).toBe(true);

      expect(await heldPaths()).toEqual(["js/old.js"]);
      expect((await fileRow(mine))?.artifactId).toBeNull();
      expect((await fileRow(theirs))?.artifactId).toBeNull();
      expect(await fileVersions()).toEqual([]);
      expect((await page()).updatedAt.getTime()).toBe(planned.before.updatedAt.getTime());
    });

    it("should refuse an upload that is unfinished, already in an artifact, or was not requested as a page file", async () => {
      const pending = await upload(ids.author, "css/pending.css");
      await getDb().update(artifactFile).set({ status: "pending" }).where(eq(artifactFile.id, pending));
      const elsewhere = await held("css/elsewhere.css", 10, ids.doc);
      const plain = await upload(ids.author, "notes.txt");
      await getDb().update(artifactFile).set({ pagePath: null }).where(eq(artifactFile.id, plain));
      for (const id of [pending, elsewhere, plain]) {
        const refusal = await runPagePublish(await change({ addIds: [id] })).then(() => null, (error: unknown) => error);
        expect(isPublishRefusal(refusal), id).toBe(true);
      }
      expect(await heldPaths()).toEqual([]);
      expect((await fileRow(elsewhere))?.artifactId).toBe(ids.doc);
    });

    it("should hold the page's limits itself, counting what goes and what comes", async () => {
      const db = getDb();
      const rows = Array.from({ length: pageFileLimits.maxFiles }, (_unused, index) => {
        const id = randomUUID();
        return { id, uploaderId: ids.author, artifactId: ids.page, attachedAt: at(30), key: `files/${id}/f.css`, filename: "f.css", contentType: "text/css", size: 1, status: "ready" as const, pagePath: `css/f${String(index)}.css` };
      });
      await db.insert(artifactFile).values(rows);
      const extra = await upload(ids.author, "css/extra.css", 1);
      const second = await upload(ids.author, "css/second.css", 1);

      // One more than the page holds is refused, even though the plan was not checked first.
      const over = await runPagePublish(await change({ addIds: [extra] })).then(() => null, (error: unknown) => error);
      expect(isPublishRefusal(over)).toBe(true);
      expect((await pageFileTotals(ids.page)).count).toBe(pageFileLimits.maxFiles);
      // Two more with one removed is still one too many; one more with one removed fits.
      const first = rows[0];
      if (!first) throw new Error("No held file.");
      const stillOver = await runPagePublish(await change({ addIds: [extra, second], removeIds: [first.id] })).then(() => null, (error: unknown) => error);
      expect(isPublishRefusal(stillOver)).toBe(true);
      expect(await runPagePublish(await change({ addIds: [extra], removeIds: [first.id] }))).not.toBeNull();
      expect((await pageFileTotals(ids.page)).count).toBe(pageFileLimits.maxFiles);
    });

    it("should hold the total size itself, counting a replaced file in the old one's place", async () => {
      const big = await held("img/big.css", pageFileLimits.maxTotalBytes - 100);
      const tooBig = await upload(ids.author, "css/more.css", 101);
      const over = await runPagePublish(await change({ addIds: [tooBig] })).then(() => null, (error: unknown) => error);
      expect(isPublishRefusal(over)).toBe(true);
      // The same upload fits once the big file is replaced by a small one in the same publish.
      const small = await upload(ids.author, "img/big.css", 50);
      expect(await runPagePublish(await change({ addIds: [tooBig], replaces: [{ entryId: big, uploadId: small }] }))).not.toBeNull();
      expect(await pageFileTotals(ids.page)).toEqual({ count: 2, bytes: 151 });
    });

    it("should refuse a second file at one path, and one that differs only by letter case", async () => {
      await held("img/Logo.css");
      for (const path of ["img/Logo.css", "img/logo.css"]) {
        const twin = await upload(ids.author, path);
        const refusal = await runPagePublish(await change({ addIds: [twin] })).then(() => null, (error: unknown) => error);
        expect(isPublishRefusal(refusal), path).toBe(true);
      }
      expect(await heldPaths()).toEqual(["img/Logo.css"]);
    });

    it("should run nothing for an artifact that is not HTML, or that was saved since the plan read it", async () => {
      const css = await upload(ids.author, "css/site.css");
      expect(await runPagePublish(await change({ addIds: [css] }, ids.doc))).toBeNull();

      const planned = await change({ addIds: [css] });
      await getDb().update(artifact).set({ updatedAt: new Date(planned.before.updatedAt.getTime() + 5) }).where(eq(artifact.id, ids.page));
      expect(await runPagePublish(planned)).toBeNull();
      expect((await fileRow(css))?.artifactId).toBeNull();
      expect(await fileVersions()).toEqual([]);
    });

    it("should let only one of two publishes planned on the same save land", async () => {
      const first = await upload(ids.author, "css/a.css");
      const second = await upload(ids.author, "css/b.css");
      const [one, two] = await Promise.all([change({ addIds: [first] }), change({ addIds: [second] })]);
      const results = await Promise.all([runPagePublish(one), runPagePublish(two)]);
      expect(results.filter((result) => result !== null)).toHaveLength(1);
      expect(await heldPaths()).toHaveLength(1);
      expect(await fileVersions()).toHaveLength(1);
    });
  });

  describe("the hourly limit of a set's uploads", () => {
    it("should count every file of a set, all or none", async () => {
      const { enforceRateLimitHits, RateLimitError } = await import("@/lib/abuse/rate-limit");
      const { rateLimits } = await import("@/lib/abuse/limits");
      const subject = `publish-${tag}-uploads`;
      const { limit, windowSeconds } = rateLimits.pageFileUpload;
      // The middle of the current window, so the window cannot turn over during the test.
      const windowMs = windowSeconds * 1000;
      const now = Math.floor(Date.now() / windowMs) * windowMs + windowMs / 2;
      await enforceRateLimitHits("pageFileUpload", subject, limit - 50, now);
      // A set of 51 does not fit, and counts nothing: a set of 50 still fits afterwards.
      await expect(enforceRateLimitHits("pageFileUpload", subject, 51, now)).rejects.toBeInstanceOf(RateLimitError);
      await enforceRateLimitHits("pageFileUpload", subject, 50, now);
      await expect(enforceRateLimitHits("pageFileUpload", subject, 1, now)).rejects.toBeInstanceOf(RateLimitError);
      const [bucket] = await getDb().select().from(rateLimitBucket).where(like(rateLimitBucket.key, `pageFileUpload:${subject}`));
      expect(bucket?.count).toBe(limit);
    });
  });

  describe("publishPageFiles", () => {
    it("should refuse uploads that are not the editor's own page file uploads, by id, and change nothing", async () => {
      const theirs = await upload(ids.stranger, "css/theirs.css");
      const mine = await upload(ids.author, "css/mine.css");
      await expect(publishPageFiles(ids.author, { artifactId: ids.page, uploadIds: [mine, theirs], remove: [] }, "person")).rejects.toThrow(theirs);
      await expect(publishPageFiles(ids.author, { artifactId: ids.page, uploadIds: [randomUUID()], remove: [] }, "person")).rejects.toThrow("unknown, already in an artifact, not yours");
      expect(await heldPaths()).toEqual([]);
      expect((await fileRow(theirs))?.artifactId).toBeNull();
    });

    it("should refuse an artifact that is not HTML", async () => {
      const css = await upload(ids.author, "css/site.css");
      await expect(publishPageFiles(ids.author, { artifactId: ids.doc, uploadIds: [css], remove: [] }, "person")).rejects.toThrow("Page files belong to an HTML artifact");
      expect((await fileRow(css))?.artifactId).toBeNull();
    });

    it("should name every file at fault in one refusal and change nothing", async () => {
      await held("img/Logo.css");
      const twin = await upload(ids.author, "img/logo.css");
      const fine = await upload(ids.author, "css/fine.css");
      const refusal = await publishPageFiles(ids.author, { artifactId: ids.page, uploadIds: [fine, twin], remove: ["js/missing.js"] }, "person").then(() => "", (error: unknown) => (error instanceof Error ? error.message : ""));
      expect(refusal).toContain("Nothing was published.");
      expect(refusal).toContain("- img/logo.css:");
      expect(refusal).toContain("- js/missing.js:");
      expect(refusal).not.toContain("- css/fine.css:");
      expect(await heldPaths()).toEqual(["img/Logo.css"]);
      expect(await fileVersions()).toEqual([]);
    });

    it("should land only on the save the agent read when it names a base, and plan again without one", async () => {
      const css = await upload(ids.author, "css/site.css");
      const read = await page();
      await getDb().update(artifact).set({ updatedAt: new Date(read.updatedAt.getTime() + 5) }).where(eq(artifact.id, ids.page));
      const stale = { versionId: "start", updatedAt: read.updatedAt };
      await expect(publishPageFiles(ids.author, { artifactId: ids.page, uploadIds: [css], remove: [], base: stale }, "agent")).rejects.toBeInstanceOf(EditConflictError);
      expect(await heldPaths()).toEqual([]);

      const current = await page();
      const published = await publishPageFiles(ids.author, { artifactId: ids.page, uploadIds: [css], remove: [], base: { versionId: "start", updatedAt: current.updatedAt } }, "agent");
      expect(published).toMatchObject({ status: "applied", added: ["css/site.css"], replaced: [], removed: [] });
      expect((await page()).updatedAt.getTime()).toBe(published.savedAt.getTime());
    });

    it("should delete the removed files' objects, and keep an image that is the artifact's icon", async () => {
      const old = await held("js/old.js");
      const oldKey = (await fileRow(old))?.key;
      const icon = await held("img/icon.css");
      await getDb().update(artifact).set({ icon: `file:${icon}` }).where(eq(artifact.id, ids.page));

      await expect(publishPageFiles(ids.author, { artifactId: ids.page, uploadIds: [], remove: ["img/icon.css", "js/old.js"] }, "person")).rejects.toThrow("icon or cover");
      expect(await heldPaths()).toEqual(["img/icon.css", "js/old.js"]);

      const published = await publishPageFiles(ids.author, { artifactId: ids.page, uploadIds: [], remove: ["js/old.js"] }, "person");
      expect(published.removed).toEqual(["js/old.js"]);
      expect(await heldPaths()).toEqual(["img/icon.css"]);
      expect(deleted).toEqual([oldKey]);
    });

    it("should remove a file that was replaced before, and leave its old copies to the cleanup job", async () => {
      const css = await held("css/site.css");
      const next = await upload(ids.author, "css/site.css", 20);
      await publishPageFiles(ids.author, { artifactId: ids.page, uploadIds: [next], remove: [] }, "person");
      expect(await getDb().select().from(artifactFileCopy).where(eq(artifactFileCopy.fileId, css))).toHaveLength(1);

      const published = await publishPageFiles(ids.author, { artifactId: ids.page, uploadIds: [], remove: ["css/site.css"] }, "person");
      expect(published.removed).toEqual(["css/site.css"]);
      expect(await heldPaths()).toEqual([]);
      // The copy no longer belongs to a file entry: cleanupOrphanCopies removes such copies and their objects.
      const copies = await getDb().select().from(artifactFileCopy).where(eq(artifactFileCopy.artifactId, ids.page));
      expect(copies.map((copy) => copy.fileId)).toEqual([null]);
    });

    it("should keep a reader of the approved version on the files that version had", async () => {
      const css = await held("css/site.css", 10);
      const oldKey = (await fileRow(css))?.key;
      // The version readers outside the team are served, saved before the publish.
      const approvedAt = at(20);
      const approved = await insertVersion(await page(), { createdBy: ids.author, saveKind: "files", at: approvedAt });
      const next = await upload(ids.author, "css/site.css", 20);
      const nextKey = (await fileRow(next))?.key;
      const added = await upload(ids.author, "js/app.js");
      const published = await publishPageFiles(ids.author, { artifactId: ids.page, uploadIds: [next, added], remove: [] }, "person");
      expect(published).toMatchObject({ added: ["js/app.js"], replaced: ["css/site.css"] });
      expect(approved).not.toBe(published.versionId);

      // As that reader gets it: the copy that was current then, and no file added since.
      expect(await findPageFile(ids.page, "css/site.css", approvedAt)).toMatchObject({ id: css, key: oldKey, size: 10 });
      expect(await findPageFile(ids.page, "js/app.js", approvedAt)).toBeNull();
      // As a reader of the published version, and as people who may edit, get it: the new files.
      expect(await findPageFile(ids.page, "css/site.css", published.savedAt)).toMatchObject({ id: css, key: nextKey, size: 20 });
      expect(await findPageFile(ids.page, "js/app.js", published.savedAt)).not.toBeNull();
      expect(await findPageFile(ids.page, "css/site.css", null)).toMatchObject({ key: nextKey });
    });
  });
});
