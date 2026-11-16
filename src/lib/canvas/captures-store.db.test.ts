import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as R2 from "@/lib/files/r2";

/*
 * Frame capture rows against a real Postgres: the one statement that makes
 * a capture current, the one way a capture is deleted, the cleanup job's
 * part, what goes with a deleted artifact, and what counts toward the
 * storage quota. R2 is a map in memory. It runs only when TEST_DATABASE_URL
 * names a throwaway local database with the migrations applied; never point
 * it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

const bucket = await vi.hoisted(async () => (await import("@/test/fake-capture-bucket")).fakeCaptureBucket());
vi.mock("@/lib/files/r2", async (importOriginal) => ({ ...(await importOriginal<typeof R2>()), ...bucket.r2 }));

describe.runIf(Boolean(databaseUrl))("frame capture rows with a database", async () => {
  const { eq, inArray, or } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { frameCapture } = await import("@/db/frame-capture-schema");
  const { agent, artifact, team, user } = await import("@/db/schema");
  const { deleteArtifact } = await import("@/lib/artifacts");
  const { fileBytesUsed } = await import("@/lib/quota/usage");
  const { captureLimits, captureObjectKeys } = await import("./capture-rules");
  const { markCaptureReady, removeArtifactCaptures, removeCapture, removeStaleCaptures, sweepCaptures } = await import("./captures-store");

  const tag = randomUUID().slice(0, 8);
  const users = { ada: `capstore-${tag}-ada`, bot: `capstore-${tag}-bot`, bo: `capstore-${tag}-bo` };
  const canvasId = randomUUID();
  const teamId = `capstore-${tag}-team`;
  const now = new Date();
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const old = ago(captureLimits.removalGraceMs + 60_000);

  type Insert = typeof frameCapture.$inferInsert;

  /** Inserts a capture with its parts in the bucket. Old by default, so a removal can finish at once. */
  async function capture(values: Partial<Insert> = {}): Promise<string> {
    const row: Insert = { id: randomUUID(), artifactId: canvasId, mode: "light", frameHash: "hash-a", status: "ready", partCount: 2, columns: 1, width: 1440, height: 1000, drawnHeight: 1000, contentType: "image/webp", bytes: 9000, capturedBy: users.ada, startedAt: old, ...values };
    await getDb().insert(frameCapture).values(row);
    for (const key of captureObjectKeys(row.artifactId, row.id, row.partCount)) bucket.objects.set(key, { size: 4500, contentType: "image/webp", start: new Uint8Array() });
    return row.id;
  }
  const statusOf = async (id: string) => (await getDb().select({ status: frameCapture.status }).from(frameCapture).where(eq(frameCapture.id, id)))[0]?.status ?? "gone";
  const partsOf = (id: string, artifactId = canvasId) => captureObjectKeys(artifactId, id, 2).filter((key) => bucket.objects.has(key)).length;
  const mine = or(eq(frameCapture.artifactId, canvasId), inArray(frameCapture.capturedBy, Object.values(users)), eq(frameCapture.frameHash, `orphan-${tag}`));

  async function insertCanvas() {
    await getDb().insert(artifact).values({ id: canvasId, userId: users.ada, updatedBy: users.ada, title: "Board", content: JSON.stringify({ version: 1, frames: [] }), kind: "canvas", shareId: randomUUID().replaceAll("-", ""), publicId: `caps${tag}` }).onConflictDoNothing();
  }

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values(Object.values(users).map((id) => ({ id, name: id, email: `${id}@example.com` })));
    // An agent that Ada owns: its captures would count toward her account.
    await db.insert(team).values({ id: teamId, name: "Captures team", slug: teamId, personal: false });
    await db.insert(agent).values({ userId: users.bot, teamId, ownerId: users.ada });
    await insertCanvas();
  });

  beforeEach(() => {
    bucket.objects.clear();
    bucket.deleted.length = 0;
    bucket.state.deletesFail = false;
  });

  afterEach(async () => {
    await getDb().delete(frameCapture).where(mine);
    await insertCanvas();
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifact).where(eq(artifact.id, canvasId));
    await db.delete(agent).where(eq(agent.userId, users.bot));
    await db.delete(team).where(eq(team.id, teamId));
    await db.delete(user).where(inArray(user.id, Object.values(users)));
  });

  describe("markCaptureReady", () => {
    it("should make the capture ready and remove every other capture of that content and mode, in one statement", async () => {
      const older = await capture({ status: "ready" });
      const rival = await capture({ status: "pending", startedAt: now });
      const dark = await capture({ status: "ready", mode: "dark" });
      const other = await capture({ status: "ready", frameHash: "hash-b" });
      const id = await capture({ status: "pending", startedAt: now });
      expect(await markCaptureReady({ id, artifactId: canvasId, frameHash: "hash-a", mode: "light" }, now)).toBe(true);
      expect(await statusOf(id)).toBe("ready");
      // The older image is gone with its parts. The rival started just now, so its row waits for its upload URLs to end, without its parts.
      expect(await statusOf(older)).toBe("gone");
      expect(await statusOf(rival)).toBe("removed");
      expect([partsOf(older), partsOf(rival), partsOf(id)]).toEqual([0, 0, 2]);
      // Another mode and another content are untouched.
      expect([await statusOf(dark), await statusOf(other), partsOf(dark), partsOf(other)]).toEqual(["ready", "ready", 2, 2]);
    });

    it("should change nothing when the capture is no longer pending", async () => {
      const current = await capture({ status: "ready" });
      const lost = await capture({ status: "removed" });
      expect(await markCaptureReady({ id: lost, artifactId: canvasId, frameHash: "hash-a", mode: "light" }, now)).toBe(false);
      expect([await statusOf(current), await statusOf(lost), partsOf(current)]).toEqual(["ready", "removed", 2]);
      // Marking a ready capture again retires nothing either.
      const rival = await capture({ status: "pending", startedAt: now });
      expect(await markCaptureReady({ id: current, artifactId: canvasId, frameHash: "hash-a", mode: "light" }, now)).toBe(false);
      expect(await statusOf(rival)).toBe("pending");
    });

    it("should leave exactly one ready capture when two of the same content are marked at the same moment", async () => {
      for (let round = 0; round < 20; round += 1) {
        const first = await capture({ status: "pending", startedAt: now });
        const second = await capture({ status: "pending", startedAt: now });
        const results = await Promise.all([first, second].map((id) => markCaptureReady({ id, artifactId: canvasId, frameHash: "hash-a", mode: "light" }, now)));
        const statuses = [await statusOf(first), await statusOf(second)];
        expect(statuses.filter((status) => status === "ready")).toHaveLength(1);
        expect(results.filter(Boolean)).toHaveLength(1);
        await getDb().delete(frameCapture).where(eq(frameCapture.artifactId, canvasId));
      }
    });

  });

  describe("removal", () => {
    it("should delete a capture's parts and then its row", async () => {
      const id = await capture();
      await removeCapture(id, now);
      expect([await statusOf(id), partsOf(id)]).toEqual(["gone", 0]);
      expect(bucket.deleted.sort()).toEqual(captureObjectKeys(canvasId, id, 2).sort());
    });

    it("should keep the row as removed when a part could not be deleted, so the cleanup job can finish", async () => {
      const id = await capture();
      bucket.state.deletesFail = true;
      await removeCapture(id, now);
      expect([await statusOf(id), partsOf(id)]).toEqual(["removed", 2]);
      bucket.state.deletesFail = false;
      expect(await sweepCaptures(now)).toEqual({ removed: 1, remaining: false });
      expect([await statusOf(id), partsOf(id)]).toEqual(["gone", 0]);
    });

    it("should keep a young capture's row until its upload URLs have ended, then delete late parts with it", async () => {
      const id = await capture({ status: "pending", startedAt: now });
      await removeCapture(id, now);
      expect([await statusOf(id), partsOf(id)]).toEqual(["removed", 0]);
      // A part arrives late, through an upload URL that still worked.
      bucket.objects.set(captureObjectKeys(canvasId, id, 2)[0] ?? "", { size: 4500, contentType: "image/webp", start: new Uint8Array() });
      expect(await sweepCaptures(new Date(now.getTime() + captureLimits.uploadUrlSeconds * 1000))).toEqual({ removed: 0, remaining: false });
      expect(await statusOf(id)).toBe("removed");
      expect(await sweepCaptures(new Date(now.getTime() + captureLimits.removalGraceMs + 1000))).toEqual({ removed: 1, remaining: false });
      expect([await statusOf(id), partsOf(id)]).toEqual(["gone", 0]);
    });

    it("should remove only captures whose content is no longer on the board", async () => {
      const kept = await capture({ frameHash: "hash-a", mode: "light" });
      const otherMode = await capture({ frameHash: "hash-a", mode: "dark" });
      const left = await capture({ frameHash: "hash-b" });
      const pending = await capture({ frameHash: "hash-c", status: "pending" });
      expect(await removeStaleCaptures(canvasId, [{ frameHash: "hash-a", mode: "light" }], now)).toBe(3);
      expect([await statusOf(kept), await statusOf(otherMode), await statusOf(left), await statusOf(pending)]).toEqual(["ready", "gone", "gone", "gone"]);
      expect(partsOf(kept)).toBe(2);
      // With nothing on the board, every capture goes.
      expect(await removeStaleCaptures(canvasId, [], now)).toBe(1);
      expect(await statusOf(kept)).toBe("gone");
    });
  });

  describe("sweepCaptures", () => {
    it("should remove captures still pending after an hour, and leave newer ones and ready ones", async () => {
      const expired = await capture({ status: "pending", startedAt: ago(captureLimits.pendingTtlMs + 1000) });
      const fresh = await capture({ status: "pending", startedAt: ago(captureLimits.pendingTtlMs - 60_000) });
      const ready = await capture({ status: "ready", startedAt: ago(30 * 86_400_000) });
      expect(await sweepCaptures(now)).toEqual({ removed: 1, remaining: false });
      expect([await statusOf(expired), await statusOf(fresh), await statusOf(ready)]).toEqual(["gone", "pending", "ready"]);
      expect([partsOf(expired), partsOf(fresh), partsOf(ready)]).toEqual([0, 2, 2]);
    });

    it("should remove captures whose artifact is gone", async () => {
      const gone = randomUUID();
      const orphan = await capture({ artifactId: gone, frameHash: `orphan-${tag}` });
      const kept = await capture();
      expect(await sweepCaptures(now)).toEqual({ removed: 1, remaining: false });
      expect([await statusOf(orphan), partsOf(orphan, gone), await statusOf(kept)]).toEqual(["gone", 0, "ready"]);
    });
  });

  describe("with their artifact", () => {
    it("should remove every capture of an artifact, whatever its status", async () => {
      const ready = await capture();
      const pending = await capture({ status: "pending", frameHash: "hash-b" });
      await removeArtifactCaptures(canvasId, now);
      expect([await statusOf(ready), await statusOf(pending), bucket.objects.size]).toEqual(["gone", "gone", 0]);
    });

    it("should delete an artifact's captures when the artifact is deleted", async () => {
      const ready = await capture();
      const young = await capture({ status: "pending", frameHash: "hash-b", startedAt: now });
      expect(await deleteArtifact(users.ada, canvasId)).toBe(true);
      expect(bucket.objects.size).toBe(0);
      // The young capture's row waits for its upload URLs to end, then the cleanup job takes it.
      expect([await statusOf(ready), await statusOf(young)]).toEqual(["gone", "removed"]);
      await sweepCaptures(new Date(now.getTime() + captureLimits.removalGraceMs + 60_000));
      expect(await statusOf(young)).toBe("gone");
    });

    it("should leave captures the cleanup job can finish when their removal fails as the artifact is deleted", async () => {
      const ready = await capture();
      bucket.state.deletesFail = true;
      expect(await deleteArtifact(users.ada, canvasId)).toBe(true);
      expect([await statusOf(ready), partsOf(ready)]).toEqual(["removed", 2]);
      bucket.state.deletesFail = false;
      expect(await sweepCaptures(now)).toEqual({ removed: 1, remaining: false });
      expect([await statusOf(ready), partsOf(ready)]).toEqual(["gone", 0]);
    });
  });

  describe("storage quota", () => {
    it("should count ready captures and captures started within the hour, for the person and the agents they own", async () => {
      const before = await fileBytesUsed(users.ada, now);
      await capture({ bytes: 1000, status: "ready", startedAt: ago(30 * 86_400_000) });
      await capture({ bytes: 200, status: "pending", startedAt: ago(60_000), frameHash: "hash-b" });
      await capture({ bytes: 30, status: "ready", capturedBy: users.bot, frameHash: "hash-c" });
      // Not counted: an abandoned pending capture, a removed one, and someone else's.
      await capture({ bytes: 4000, status: "pending", startedAt: ago(captureLimits.pendingTtlMs + 1000), frameHash: "hash-d" });
      await capture({ bytes: 50_000, status: "removed", frameHash: "hash-e" });
      await capture({ bytes: 600_000, status: "ready", capturedBy: users.bo, frameHash: "hash-f" });
      expect((await fileBytesUsed(users.ada, now)) - before).toBe(1230);
      expect(await fileBytesUsed(users.bot, now)).toBe(await fileBytesUsed(users.ada, now));
      expect(await fileBytesUsed(users.bo, now)).toBe(600_000);
    });
  });
});
