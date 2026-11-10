import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * The named_in_content_at backfill (drizzle/0041), run again inside a
 * transaction the way the deploy runs it, against a real Postgres. It runs
 * only when TEST_DATABASE_URL names a throwaway local database with the
 * migrations applied (`pnpm db:migrate`); never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

const backfill = readFileSync(new URL("../../../drizzle/0041_backfill_file_named_in_content_at.sql", import.meta.url), "utf8").replaceAll("--> statement-breakpoint", "");

describe.runIf(Boolean(databaseUrl))("the named_in_content_at backfill", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, artifactFile, artifactVersion, user } = await import("@/db/schema");
  const { generatePublicId } = await import("@/lib/public-id");

  const tag = randomUUID().slice(0, 8);
  const author = `backfill-${tag}-author`;
  const doc = `backfill-${tag}-doc`;
  const embedded = randomUUID();
  const plain = randomUUID();
  const marked = randomUUID();
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 9, minute));

  async function namedAt(fileId: string) {
    const [row] = await getDb().select({ at: artifactFile.namedInContentAt }).from(artifactFile).where(eq(artifactFile.id, fileId));
    return row?.at ?? null;
  }

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values({ id: author, name: author, email: `${author}@example.com` });
    await db.insert(artifact).values({ id: doc, userId: author, updatedBy: author, kind: "markdown", title: "Plan", content: "# Plan\n", visibility: "private", shareId: randomUUID().replaceAll("-", ""), publicId: generatePublicId() });
    const file = { uploaderId: author, artifactId: doc, filename: "a.png", contentType: "image/png", size: 10, status: "ready" as const, attachedAt: at(0) };
    await db.insert(artifactFile).values([
      { ...file, id: embedded, key: `files/${embedded}/a.png` },
      { ...file, id: plain, key: `files/${plain}/a.png` },
      { ...file, id: marked, key: `files/${marked}/a.png`, namedInContentAt: at(50) },
    ]);
    const version = (minute: number, content: string) => ({ id: randomUUID(), artifactId: doc, title: "Plan", kind: "markdown" as const, content, createdBy: author, createdAt: at(minute), savedAt: at(minute) });
    await db.insert(artifactVersion).values([
      version(5, "# Plan\n"),
      version(10, `![A](/api/files/${embedded.toUpperCase()})\n\n![M](/api/files/${marked})`),
      version(20, `![A](/api/files/${embedded})`),
    ]);
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(`BEGIN;\n${backfill}\nCOMMIT;`);
    } finally {
      await client.end();
    }
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifactFile).where(inArray(artifactFile.id, [embedded, plain, marked]));
    await db.delete(artifactVersion).where(eq(artifactVersion.artifactId, doc));
    await db.delete(artifact).where(eq(artifact.id, doc));
    await db.delete(user).where(eq(user.id, author));
  });

  it("should date an embedded file by the earliest kept version that names it, in any case", async () => {
    expect(await namedAt(embedded)).toEqual(at(10));
  });

  it("should leave a plain attachment no version names without a time", async () => {
    expect(await namedAt(plain)).toBeNull();
  });

  it("should keep the time a save already set", async () => {
    expect(await namedAt(marked)).toEqual(at(50));
  });
});
