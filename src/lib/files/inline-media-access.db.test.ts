import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * Who can load an image embedded in a Markdown artifact, against a real
 * Postgres: the same findReadableFile the /api/files route calls. Media
 * access follows the artifact. Its readers (and readers of the approved
 * version) load what that version shows; nobody else loads anything, and a
 * kept image never reaches readers of a version that does not show it. It
 * runs only when TEST_DATABASE_URL names a throwaway local database with the
 * migrations applied (`pnpm db:migrate`); never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("inline media access with a database", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, artifactFile, artifactVersion, user } = await import("@/db/schema");
  const { generatePublicId } = await import("@/lib/public-id");
  const { findReadableFile } = await import("./download");

  const tag = randomUUID().slice(0, 8);
  const ids = { author: `media-${tag}-author`, stranger: `media-${tag}-stranger`, doc: `media-${tag}-doc`, privateDoc: `media-${tag}-private` };
  const image = randomUUID();
  const privateImage = randomUUID();
  const versions = { before: randomUUID(), shows: randomUUID(), after: randomUUID() };
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 10, 12, minute));
  const embed = `# Plan\n\n![Chart](/api/files/${image}#width=60 "Q3")\n`;

  async function serve(versionId: string) {
    await getDb().update(artifact).set({ approvedVersionId: versionId }).where(eq(artifact.id, ids.doc));
  }

  async function cleanUp() {
    const db = getDb();
    await db.delete(artifactFile).where(inArray(artifactFile.id, [image, privateImage]));
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
      { ...file, id: image, key: `files/${image}/chart.png`, artifactId: ids.doc, attachedAt: at(10) },
      { ...file, id: privateImage, key: `files/${privateImage}/chart.png`, artifactId: ids.privateDoc, attachedAt: at(10) },
    ]);
  });

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
});
