import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * Who can load an image embedded in a Markdown artifact, against a real
 * Postgres: the same findReadableFile the /api/files route calls. Media
 * access follows the artifact. Its readers (and readers of the approved
 * version) load what that version shows; nobody else loads anything, and a
 * kept image never reaches readers of a version that does not show it, even
 * after pruning deleted every version that showed it. It runs only when TEST_DATABASE_URL names a throwaway local database with the
 * migrations applied (`pnpm db:migrate`); never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("inline media access with a database", async () => {
  const { eq, inArray, sql } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, artifactFile, artifactVersion, user } = await import("@/db/schema");
  const { generatePublicId } = await import("@/lib/public-id");
  const { getArtifactAccess } = await import("@/lib/access");
  const { insertVersion } = await import("@/lib/versions/history");
  const { filesForViewer, findReadableFile } = await import("./download");
  const { attachFileRows } = await import("./store");

  const tag = randomUUID().slice(0, 8);
  const ids = { author: `media-${tag}-author`, stranger: `media-${tag}-stranger`, doc: `media-${tag}-doc`, privateDoc: `media-${tag}-private` };
  const image = randomUUID();
  const privateImage = randomUUID();
  const lateImage = randomUUID();
  const versions = { before: randomUUID(), shows: randomUUID(), after: randomUUID() };
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 10, 12, minute));
  const embed = `# Plan\n\n![Chart](/api/files/${image}#width=60 "Q3")\n`;

  async function serve(versionId: string) {
    await getDb().update(artifact).set({ approvedVersionId: versionId }).where(eq(artifact.id, ids.doc));
  }

  async function cleanUp() {
    const db = getDb();
    await db.delete(artifactFile).where(inArray(artifactFile.id, [image, privateImage, lateImage]));
    await db.update(artifact).set({ approvedVersionId: null }).where(eq(artifact.id, ids.doc));
    await db.delete(artifactVersion).where(inArray(artifactVersion.artifactId, [ids.doc, ids.privateDoc]));
    await db.delete(artifact).where(inArray(artifact.id, [ids.doc, ids.privateDoc]));
    await db.delete(user).where(inArray(user.id, [ids.author, ids.stranger]));
  }

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values([ids.author, ids.stranger].map((userId) => ({ id: userId, name: userId, email: `${userId}@example.com` })));
    const base = { userId: ids.author, kind: "markdown" as const, updatedBy: ids.author };
    await db.insert(artifact).values([
      { ...base, id: ids.doc, title: "Public plan", content: embed, visibility: "public", shareId: randomUUID().replaceAll("-", ""), publicId: generatePublicId() },
      { ...base, id: ids.privateDoc, title: "Private plan", content: `![Secret](/api/files/${privateImage})`, visibility: "private", shareId: randomUUID().replaceAll("-", ""), publicId: generatePublicId() },
    ]);
    const version = (id: string, minute: number, content: string) => ({ id, artifactId: ids.doc, title: "Public plan", kind: "markdown" as const, content, createdBy: ids.author, createdAt: at(minute), savedAt: at(minute) });
    await db.insert(artifactVersion).values([version(versions.before, 0, "# Plan\n"), version(versions.shows, 20, embed), version(versions.after, 30, "# Plan, chart removed\n")]);
    const file = { uploaderId: ids.author, filename: "chart.png", contentType: "image/png", size: 10, status: "ready" as const };
    await db.insert(artifactFile).values([
      { ...file, id: image, key: `files/${image}/chart.png` },
      { ...file, id: lateImage, key: `files/${lateImage}/chart.png` },
      { ...file, id: privateImage, key: `files/${privateImage}/chart.png`, artifactId: ids.privateDoc, attachedAt: at(10) },
    ]);
    // Attached after a version names it, the way a save attaches its uploads; then back-dated before the approved versions.
    await attachFileRows(ids.author, ids.doc, [image, lateImage]);
    await db
      .update(artifactFile)
      .set({ attachedAt: at(10), namedInContentAt: sql`case when ${artifactFile.namedInContentAt} is null then null else ${at(20)}::timestamptz end` })
      .where(inArray(artifactFile.id, [image, lateImage]));
  });

  async function namedInContentAt(fileId: string) {
    const [row] = await getDb().select({ named: artifactFile.namedInContentAt }).from(artifactFile).where(eq(artifactFile.id, fileId));
    return row?.named ?? null;
  }

  async function reviseTo(content: string, minute: number) {
    await getDb().update(artifact).set({ content }).where(eq(artifact.id, ids.doc));
    const [record] = await getDb().select().from(artifact).where(eq(artifact.id, ids.doc));
    if (!record) throw new Error("No artifact.");
    return insertVersion(record, { createdBy: ids.author, saveKind: "edit", at: at(minute) });
  }

  async function publicFileIds() {
    const [record] = await getDb().select({ publicId: artifact.publicId }).from(artifact).where(eq(artifact.id, ids.doc));
    const viewable = record ? await getArtifactAccess(record.publicId, null) : null;
    return viewable ? (await filesForViewer(viewable)).map((file) => file.id) : [];
  }

  async function versionsNaming(fileId: string) {
    const rows = await getDb().select({ id: artifactVersion.id, content: artifactVersion.content }).from(artifactVersion).where(eq(artifactVersion.artifactId, ids.doc));
    return rows.filter((row) => row.content.includes(fileId) && row.id !== versions.shows).map((row) => row.id);
  }

  afterAll(cleanUp);

  it("should let the author load an image embedded in a private artifact, and nobody else", async () => {
    expect((await findReadableFile(privateImage, ids.author))?.id).toBe(privateImage);
    await expect(findReadableFile(privateImage, ids.stranger)).resolves.toBeNull();
    await expect(findReadableFile(privateImage, null)).resolves.toBeNull();
  });

  it("should refuse an image added after the approved version when readers outside the team ask", async () => {
    await serve(versions.before);
    await expect(findReadableFile(image, ids.stranger)).resolves.toBeNull();
    await expect(findReadableFile(image, null)).resolves.toBeNull();
    expect((await findReadableFile(image, ids.author))?.id).toBe(image);
  });

  it("should let readers of the approved version load an image that version shows", async () => {
    await serve(versions.shows);
    expect((await findReadableFile(image, ids.stranger))?.id).toBe(image);
    expect((await findReadableFile(image, null))?.id).toBe(image);
  });

  it("should refuse a kept image when the approved version no longer shows it", async () => {
    await serve(versions.after);
    await expect(findReadableFile(image, ids.stranger)).resolves.toBeNull();
    await expect(findReadableFile(image, null)).resolves.toBeNull();
    expect((await findReadableFile(image, ids.author))?.id).toBe(image);
  });

  it("should keep a plain attachment readable for approved readers when only a draft after their version embeds it", async () => {
    await serve(versions.after);
    const draft = await reviseTo(`# Plan\n\n![Late](/api/files/${lateImage})\n`, 40);
    expect(await namedInContentAt(lateImage)).toEqual(at(40));
    expect((await findReadableFile(lateImage, null))?.id).toBe(lateImage);
    expect(await publicFileIds()).toContain(lateImage);
    await getDb().delete(artifactVersion).where(eq(artifactVersion.id, draft));
    await getDb().update(artifactFile).set({ namedInContentAt: null }).where(eq(artifactFile.id, lateImage));
  });

  it("should mark a file as embedded when it is attached after a version names it, and when a version names it after it is attached", async () => {
    expect(await namedInContentAt(image)).toEqual(at(20));
    expect(await namedInContentAt(lateImage)).toBeNull();
    // Named by a version before the approved one (minute 30), so it is content for that version's readers.
    await reviseTo(`# Plan\n\n![Late](/api/files/${lateImage})\n`, 25);
    expect(await namedInContentAt(lateImage)).toEqual(at(25));
  });

  it("should keep refusing removed images, and leave them out of the file list, after pruning deleted every version that showed them, in both orders of attach and save", async () => {
    await serve(versions.after);
    await getDb().delete(artifactVersion).where(inArray(artifactVersion.id, [versions.shows, ...(await versionsNaming(lateImage))]));
    // Attached after the version that named it: only attachFileRows (namedAtAttach) set its time.
    await expect(findReadableFile(image, ids.stranger)).resolves.toBeNull();
    await expect(findReadableFile(image, null)).resolves.toBeNull();
    // Attached before a version named it: only markNamedInContent set its time, and that version is gone too.
    await expect(findReadableFile(lateImage, null)).resolves.toBeNull();
    expect(await publicFileIds()).toEqual([]);
    expect((await findReadableFile(image, ids.author))?.id).toBe(image);
  });
});
