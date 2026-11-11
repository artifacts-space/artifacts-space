import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Copies from "./copies";

/*
 * Replacing a file against a real Postgres: the approval outcome lands in
 * the swap's own statement, the swap refuses what changed after its checks
 * (an icon or cover in a new version, the artifact's sharing), the Files
 * section learns which images a version pictures, and icon cleanup deletes
 * the object a row holds when it deletes the row. R2 is stubbed at its
 * boundary. It runs only when TEST_DATABASE_URL names a throwaway local
 * database with the migrations applied (`pnpm db:migrate`).
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

/** Runs once, right before icon cleanup removes a file's old copies: between its read of the rows and its delete. */
const between = vi.hoisted((): { run: (() => Promise<unknown>) | null } => ({ run: null }));
vi.mock("./copies", async (importOriginal) => {
  const actual = await importOriginal<typeof Copies>();
  return {
    ...actual,
    removeCopiesOf: async (fileIds: readonly string[]) => {
      const run = between.run;
      between.run = null;
      if (run) await run();
      return actual.removeCopiesOf(fileIds);
    },
  };
});

describe.runIf(Boolean(databaseUrl))("replacing a file, its approval and races, with a database", async () => {
  const { eq, inArray, like, or } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifactFileCopy } = await import("@/db/file-copy-schema");
  const { artifact, artifactFile, artifactVersion, rateLimitBucket, sharingRequest, team, teamMember, user } = await import("@/db/schema");
  const { generatePublicId } = await import("@/lib/public-id");
  const { insertVersion } = await import("@/lib/versions/history");
  const { findReadableFile } = await import("./download");
  const { pruneUnusedIconFiles } = await import("./icon-cleanup");
  const { replaceFile } = await import("./replace");
  const { listFilesForArtifacts } = await import("./store");

  const tag = randomUUID().slice(0, 8);
  const ids = { author: `replace-a-${tag}-author`, doc: `replace-a-${tag}-doc`, other: `replace-a-${tag}-other` };
  const teamId = `replace-a-${tag}-team`;
  const sow = randomUUID();
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

  async function upload(filename = "sow-v2.pdf", contentType = "application/pdf") {
    const id = randomUUID();
    await getDb().insert(artifactFile).values({ id, uploaderId: ids.author, key: `files/${id}/${filename}`, filename, contentType, size: 20, status: "ready" });
    return id;
  }

  async function attached(artifactId: string, filename: string, contentType: string) {
    const id = randomUUID();
    await getDb().insert(artifactFile).values({ id, uploaderId: ids.author, artifactId, attachedAt: minutesAgo(25), key: `files/${id}/${filename}`, filename, contentType, size: 10, status: "ready" });
    return id;
  }

  async function entry(fileId: string) {
    const [row] = await getDb().select().from(artifactFile).where(eq(artifactFile.id, fileId));
    return row ?? null;
  }

  /** Files a version of `artifactId` as it is now, with `changes` (such as an icon), saved at `savedAt`. */
  async function versionOf(artifactId: string, changes: { icon?: string | null } = {}, savedAt = new Date()) {
    const [record] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId));
    if (!record) throw new Error("No artifact.");
    return insertVersion({ ...record, ...changes }, { createdBy: ids.author, saveKind: "files", at: savedAt });
  }

  /** Puts the artifact in a team where the author has `role`: a member's edits to a public artifact wait for approval; an owner's apply. */
  async function inTeam(role: "member" | "owner") {
    await getDb().insert(team).values({ id: teamId, name: "Replace team", slug: teamId, personal: false });
    await getDb().insert(teamMember).values({ id: `${teamId}-m`, teamId, userId: ids.author, role });
    await getDb().update(artifact).set({ teamId }).where(eq(artifact.id, ids.doc));
  }

  async function requests() {
    return getDb().select().from(sharingRequest).where(eq(sharingRequest.artifactId, ids.doc));
  }

  async function replaceVersions() {
    const rows = await getDb().select().from(artifactVersion).where(eq(artifactVersion.artifactId, ids.doc));
    return rows.filter((row) => row.saveKind === "replace").sort((a, b) => a.savedAt.getTime() - b.savedAt.getTime());
  }

  async function approvedVersionId() {
    const [row] = await getDb().select({ id: artifact.approvedVersionId }).from(artifact).where(eq(artifact.id, ids.doc));
    return row?.id ?? null;
  }

  async function copies() {
    return getDb().select().from(artifactFileCopy).where(eq(artifactFileCopy.artifactId, ids.doc));
  }

  async function clearCase() {
    const db = getDb();
    const docs = [ids.doc, ids.other];
    await db.update(artifact).set({ approvedVersionId: null, teamId: null, visibility: "public", icon: null }).where(inArray(artifact.id, docs));
    await db.delete(sharingRequest).where(inArray(sharingRequest.artifactId, docs));
    await db.delete(team).where(eq(team.id, teamId));
    await db.delete(artifactFileCopy).where(or(inArray(artifactFileCopy.artifactId, docs), eq(artifactFileCopy.uploaderId, ids.author)));
    await db.delete(artifactFile).where(eq(artifactFile.uploaderId, ids.author));
    await db.delete(artifactVersion).where(inArray(artifactVersion.artifactId, docs));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%replace-a-${tag}%`));
  }

  beforeAll(async () => {
    await getDb().insert(user).values({ id: ids.author, name: ids.author, email: `${ids.author}@example.com` });
    await getDb().insert(artifact).values([ids.doc, ids.other].map((id) => ({ id, userId: ids.author, updatedBy: ids.author, kind: "markdown" as const, title: id, content: "# Plan", visibility: "public" as const, shareId: randomUUID().replaceAll("-", ""), publicId: generatePublicId() })));
  });

  /* Each case: a public file artifact holding sow.pdf, attached 30 minutes ago, with a version from then. */
  beforeEach(async () => {
    await clearCase();
    await getDb().insert(artifactFile).values({ id: sow, uploaderId: ids.author, artifactId: ids.doc, attachedAt: minutesAgo(30), key: `files/${sow}/sow.pdf`, filename: "sow.pdf", contentType: "application/pdf", size: 10, status: "ready" });
    await versionOf(ids.doc, {}, minutesAgo(29));
    r2.deleted.length = 0;
    between.run = null;
  });

  afterAll(async () => {
    await clearCase();
    await getDb().delete(artifact).where(inArray(artifact.id, [ids.doc, ids.other]));
    await getDb().delete(user).where(eq(user.id, ids.author));
  });

  describe("approval", () => {
    it("should open the edit request in the same statement as the swap when the change needs approval, and move it along on the next replace", async () => {
      await inTeam("member");
      const result = await replaceFile(ids.author, { fileId: sow, uploadId: await upload() }, "person");

      expect(result.status).toBe("pending");
      const [version] = await replaceVersions();
      expect(await requests()).toEqual([expect.objectContaining({ kind: "edit", status: "pending", versionId: version?.id, teamId, requestedBy: ids.author, visibility: "public" })]);
      // The approved version stays the one from before the replace, so readers outside the team keep the old file.
      expect(await approvedVersionId()).not.toBeNull();
      expect(await approvedVersionId()).not.toBe(version?.id);
      expect((await findReadableFile(sow, null))?.key).toBe(`files/${sow}/sow.pdf`);

      await replaceFile(ids.author, { fileId: sow, uploadId: await upload("sow-v3.pdf") }, "person");
      const newest = (await replaceVersions()).at(-1);
      expect(await requests()).toEqual([expect.objectContaining({ status: "pending", versionId: newest?.id })]);
    });

    it("should make the replace's version the approved one, with an audit row, when an approver replaces", async () => {
      await inTeam("owner");
      const next = await upload();
      const result = await replaceFile(ids.author, { fileId: sow, uploadId: next }, "person");

      expect(result.status).toBe("applied");
      const [version] = await replaceVersions();
      expect(await approvedVersionId()).toBe(version?.id);
      expect(await requests()).toEqual([expect.objectContaining({ kind: "edit", status: "approved", versionId: version?.id, decidedBy: ids.author })]);
      expect((await findReadableFile(sow, null))?.key).toBe(`files/${next}/sow-v2.pdf`);
    });

    it("should date the copy, the version, and the artifact's save by one app-clock time", async () => {
      const before = Date.now();
      await replaceFile(ids.author, { fileId: sow, uploadId: await upload() }, "person");
      const [copy] = await copies();
      const [version] = await replaceVersions();
      const [record] = await getDb().select().from(artifact).where(eq(artifact.id, ids.doc));

      expect(copy?.replacedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(version?.savedAt.getTime()).toBe(copy?.replacedAt.getTime());
      expect(record?.updatedAt.getTime()).toBe(copy?.replacedAt.getTime());
      expect(version?.bytes).toBeGreaterThan(0);
    });
  });

  describe("changes between the checks and the swap", () => {
    it("should refuse and leave the file, upload, and requests as they were when a version starts showing the file as its icon after the check", async () => {
      await inTeam("member");
      const image = await attached(ids.doc, "logo.png", "image/png");
      const next = await upload("logo-v2.png", "image/png");
      // The harness stamp is read after the checks and before the swap: an icon change lands right then.
      const iconSetMeanwhile = async () => {
        await versionOf(ids.doc, { icon: `file:${image}` });
        return null;
      };

      await expect(replaceFile(ids.author, { fileId: image, uploadId: next }, "agent", iconSetMeanwhile)).rejects.toThrow(/changed while it was being replaced/);
      expect((await entry(image))?.key).toBe(`files/${image}/logo.png`);
      expect(await entry(next)).not.toBeNull();
      expect(await copies()).toEqual([]);
      expect(await replaceVersions()).toEqual([]);
      expect(await requests()).toEqual([]);
    });

    it("should refuse and leave the file and requests as they were when the artifact's sharing changes after the approval was decided", async () => {
      await inTeam("member");
      const madeTeamOnlyMeanwhile = async () => {
        await getDb().update(artifact).set({ visibility: "team" }).where(eq(artifact.id, ids.doc));
        return null;
      };

      await expect(replaceFile(ids.author, { fileId: sow, uploadId: await upload() }, "agent", madeTeamOnlyMeanwhile)).rejects.toThrow(/changed while it was being replaced/);
      expect((await entry(sow))?.key).toBe(`files/${sow}/sow.pdf`);
      expect(await replaceVersions()).toEqual([]);
      expect(await requests()).toEqual([]);
    });
  });

  describe("pictured images", () => {
    it("should mark an image an older version of its own artifact shows as its icon, and refuse to replace it", async () => {
      const image = await attached(ids.doc, "icon.png", "image/png");
      await versionOf(ids.doc, { icon: `file:${image}` }, minutesAgo(24));

      const files = (await listFilesForArtifacts([ids.doc], { pictured: true })).get(ids.doc) ?? [];
      expect(files.find((file) => file.id === image)?.pictured).toBe(true);
      expect(files.find((file) => file.id === sow)?.pictured).toBeUndefined();
      await expect(replaceFile(ids.author, { fileId: image, uploadId: await upload("icon-v2.png", "image/png") }, "person")).rejects.toThrow(/icon or cover/);
      expect((await entry(image))?.key).toBe(`files/${image}/icon.png`);
    });

    it("should not mark an image that only another artifact's version names", async () => {
      const image = await attached(ids.doc, "chart.png", "image/png");
      await versionOf(ids.other, { icon: `file:${image}` });

      const listed = await listFilesForArtifacts([ids.doc, ids.other], { pictured: true });
      expect(listed.get(ids.doc)?.find((file) => file.id === image)?.pictured).toBeUndefined();
    });

    it("should leave readers' and lists' files without the flag", async () => {
      const image = await attached(ids.doc, "icon.png", "image/png");
      await versionOf(ids.doc, { icon: `file:${image}` });
      const files = (await listFilesForArtifacts([ids.doc])).get(ids.doc) ?? [];
      expect(files.find((file) => file.id === image)?.pictured).toBeUndefined();
    });
  });

  it("should delete the object a former icon holds at that moment when a replace lands while icon cleanup removes it", async () => {
    const image = await attached(ids.doc, "old-logo.png", "image/png");
    const next = await upload("new-logo.png", "image/png");
    // Cleanup has read the row (old key); the replace swaps the new object in before cleanup deletes the row.
    between.run = () => replaceFile(ids.author, { fileId: image, uploadId: next }, "person");

    await expect(pruneUnusedIconFiles(ids.doc, [`file:${image}`])).resolves.toBe(1);
    expect(await entry(image)).toBeNull();
    expect(r2.deleted).toEqual(expect.arrayContaining([`files/${next}/new-logo.png`, `files/${image}/old-logo.png`]));
    expect(await copies()).toEqual([]);
  });
});
