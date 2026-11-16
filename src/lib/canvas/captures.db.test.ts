import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as R2 from "@/lib/files/r2";
import type * as ThemeContext from "@/lib/themes/artifact-theme-context";

/*
 * Frame captures against a real Postgres: who may ask, start, and finish;
 * what a canvas needs; and what happens to a capture that fails a check.
 * The access checks are the real ones, so a test here fails when access is
 * wrongly granted. R2 is a map in memory. It runs only when TEST_DATABASE_URL
 * names a throwaway local database with the migrations applied; never point
 * it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

const bucket = await vi.hoisted(async () => (await import("@/test/fake-capture-bucket")).fakeCaptureBucket());
const theme = vi.hoisted(() => ({ fails: false }));
vi.mock("@/lib/files/r2", async (importOriginal) => ({ ...(await importOriginal<typeof R2>()), ...bucket.r2 }));
vi.mock("@/lib/themes/artifact-theme-context", async (importOriginal) => {
  const original = await importOriginal<typeof ThemeContext>();
  const loadArtifactThemeContext: typeof original.loadArtifactThemeContext = (subject, themes) => (theme.fails ? Promise.reject(new Error("The team could not be read.")) : original.loadArtifactThemeContext(subject, themes));
  return { ...original, loadArtifactThemeContext };
});

describe.runIf(Boolean(databaseUrl))("frame captures with a database", async () => {
  const { eq, inArray, like, or } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { frameCapture } = await import("@/db/frame-capture-schema");
  const { artifact, artifactFile, rateLimitBucket, user } = await import("@/db/schema");
  const { rateLimits } = await import("@/lib/abuse/limits");
  const { jpegStart, pngStart, webpStart } = await import("@/test/fake-capture-bucket");
  const { captureGeometry, captureLimits, captureObjectKey, partBox } = await import("./capture-rules");
  const { capturesNeeded, finishCapture, startCapture } = await import("./captures");

  const tag = randomUUID().slice(0, 8);
  const users = { ada: `capdb-${tag}-ada`, bo: `capdb-${tag}-bo` };
  const canvasId = randomUUID();
  const noteId = randomUUID();
  const fileId = randomUUID();

  const heading = (text: string) => ({ version: 1, root: "page", elements: { page: { type: "Stack", props: { gap: "md" }, children: ["title"] }, title: { type: "Heading", props: { text, level: 1 } } } });
  const picture = { version: 1, root: "page", elements: { page: { type: "Stack", props: { gap: "md" }, children: ["shot"] }, shot: { type: "Image", props: { file: fileId, alt: "A chart" } } } };
  const board = (title: string) => JSON.stringify({ version: 1, frames: [{ id: "home", name: "Home", width: 1440, spec: heading(title) }, { id: "phone", name: "Phone", width: 390, spec: picture }] });

  /** How many hits a rate limit has counted for a subject, over every window. */
  const counted = async (name: string, subject: string) => (await getDb().select().from(rateLimitBucket).where(eq(rateLimitBucket.key, `${name}:${subject}`))).reduce((sum, bucketRow) => sum + bucketRow.count, 0);
  const captures = () => getDb().select().from(frameCapture).where(or(eq(frameCapture.artifactId, canvasId), inArray(frameCapture.capturedBy, Object.values(users))));
  const captureById = async (id: string) => (await getDb().select().from(frameCapture).where(eq(frameCapture.id, id)))[0];

  /** The drawing of the 1440 frame in light, as the server lists it. */
  async function homeLight() {
    const needed = await capturesNeeded(users.ada, canvasId);
    if (needed.state !== "draw") throw new Error("Expected drawings.");
    const frame = needed.frames.find((candidate) => candidate.width === 1440);
    const drawing = frame?.drawings.find((candidate) => candidate.mode === "light");
    if (!drawing) throw new Error("Expected the home frame in light.");
    return drawing;
  }

  const startInput = (frameHash: string, parts: number[] = [9000], height = 600) => ({ artifactId: canvasId, frameHash, mode: "light" as const, height, partial: false, parts: parts.map((bytes) => ({ bytes, contentType: "image/webp" as const })) });

  /** Puts a started capture's parts in the bucket, as the tab's PUTs would. */
  function upload(captureId: string, width: number, height: number, sizes: number[], change: (part: number) => Partial<{ size: number; contentType: string; start: Uint8Array }> = () => ({})) {
    const geometry = captureGeometry(width, height);
    sizes.forEach((size, index) => {
      const box = partBox(geometry, width, index + 1);
      bucket.objects.set(captureObjectKey(canvasId, captureId, index + 1), { size, contentType: "image/webp", start: webpStart(box?.width ?? 0, box?.height ?? 0), ...change(index + 1) });
    });
  }

  async function startedHome(parts: number[] = [9000], height = 600) {
    const drawing = await homeLight();
    const started = await startCapture(users.ada, startInput(drawing.frameHash, parts, height));
    return { ...started, drawing };
  }

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values(Object.values(users).map((id) => ({ id, name: id, email: `${id}@example.com` })));
    // Public, so the other person may read both artifacts but may not edit them.
    const shared = { userId: users.ada, updatedBy: users.ada, visibility: "public" as const };
    await db.insert(artifact).values([
      { ...shared, id: canvasId, title: "Board", content: board("Home"), kind: "canvas", shareId: randomUUID().replaceAll("-", ""), publicId: `capc${tag}` },
      { ...shared, id: noteId, title: "Note", content: "Hello", kind: "markdown", shareId: randomUUID().replaceAll("-", ""), publicId: `capn${tag}` },
    ]);
    await db.insert(artifactFile).values({ id: fileId, uploaderId: users.ada, artifactId: canvasId, key: `files/${fileId}/chart.png`, filename: "chart.png", contentType: "image/png", size: 40, status: "ready", attachedAt: new Date() });
  });

  beforeEach(() => {
    bucket.objects.clear();
    bucket.deleted.length = 0;
    bucket.presigned.length = 0;
    bucket.state.configured = true;
    bucket.state.deletesFail = false;
    theme.fails = false;
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await getDb().delete(frameCapture).where(or(eq(frameCapture.artifactId, canvasId), inArray(frameCapture.capturedBy, Object.values(users))));
    await getDb().update(artifact).set({ content: board("Home") }).where(eq(artifact.id, canvasId));
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(rateLimitBucket).where(or(like(rateLimitBucket.key, `%capdb-${tag}-%`), like(rateLimitBucket.key, `%${canvasId}`)));
    await db.delete(artifactFile).where(eq(artifactFile.id, fileId));
    await db.delete(artifact).where(inArray(artifact.id, [canvasId, noteId]));
    await db.delete(user).where(inArray(user.id, Object.values(users)));
  });

  describe("capturesNeeded", () => {
    it("should list every frame in light and in dark, with what the tab needs to draw them, when the canvas has no images", async () => {
      const needed = await capturesNeeded(users.ada, canvasId);
      if (needed.state !== "draw") throw new Error("Expected drawings.");
      expect(needed.frames.map((frame) => [frame.width, frame.padding, frame.drawings.map((drawing) => drawing.mode)])).toEqual([[1440, "md", ["light", "dark"]], [390, "md", ["light", "dark"]]]);
      expect(JSON.parse(needed.frames[0]?.spec ?? "{}")).toEqual(heading("Home"));
      expect(needed.theme.mode).toBe("auto");
      expect(needed.files.map((file) => file.id)).toEqual([fileId]);
      // A file's storage key decides the hash, and never leaves the server.
      expect(JSON.stringify(needed)).not.toContain(`files/${fileId}`);
      expect(new Set(needed.frames.flatMap((frame) => frame.drawings.map((drawing) => drawing.frameHash))).size).toBe(4);
    });

    it("should refuse a reader who may not edit the canvas, and write no capture", async () => {
      await expect(capturesNeeded(users.bo, canvasId)).rejects.toThrow("Artifact not found.");
      expect(await captures()).toEqual([]);
    });

    it("should answer not-now before it reads or counts anything when captures are off, on a preview, or without storage", async () => {
      const before = await counted("frameCaptureNeeded", users.bo);
      vi.stubEnv("FRAME_CAPTURES", "off");
      expect(await capturesNeeded(users.bo, canvasId)).toEqual({ state: "not-now" });
      vi.unstubAllEnvs();
      vi.stubEnv("VERCEL_ENV", "preview");
      expect(await capturesNeeded(users.bo, canvasId)).toEqual({ state: "not-now" });
      vi.unstubAllEnvs();
      bucket.state.configured = false;
      expect(await capturesNeeded(users.bo, canvasId)).toEqual({ state: "not-now" });
      expect(await counted("frameCaptureNeeded", users.bo)).toBe(before);
      // The same call counts once captures can run, so the check above is not passing by luck.
      bucket.state.configured = true;
      await expect(capturesNeeded(users.bo, canvasId)).rejects.toThrow("Artifact not found.");
      expect(await counted("frameCaptureNeeded", users.bo)).toBe(before + 1);
    });

    it("should answer not-now when the artifact is not a canvas or its theme could not be read", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      expect(await capturesNeeded(users.ada, noteId)).toEqual({ state: "not-now" });
      expect(logged).not.toHaveBeenCalled();
      theme.fails = true;
      expect(await capturesNeeded(users.ada, canvasId)).toEqual({ state: "not-now" });
      expect(await captures()).toEqual([]);
      // The failure leaves a trace: the error's name, never its message, a theme, or a team.
      expect(logged.mock.calls).toEqual([["[captures] A canvas's theme could not be read", "Error"]]);
      logged.mockRestore();
    });

    it("should leave out a drawing that has a current image, and one another tab just started", async () => {
      const { captureId, drawing } = await startedHome();
      const during = await capturesNeeded(users.ada, canvasId);
      if (during.state !== "draw") throw new Error("Expected drawings.");
      expect(during.frames.flatMap((frame) => frame.drawings)).not.toContainEqual(drawing);
      upload(captureId, 1440, 600, [9000]);
      expect(await finishCapture(users.ada, captureId)).toEqual({ current: true });
      const after = await capturesNeeded(users.ada, canvasId);
      if (after.state !== "draw") throw new Error("Expected drawings.");
      expect(after.frames.flatMap((frame) => frame.drawings)).toHaveLength(3);
      // Once the other tab's claim has run out, its drawing is offered again.
      await getDb().update(frameCapture).set({ status: "pending" }).where(eq(frameCapture.id, captureId));
      const later = await capturesNeeded(users.ada, canvasId, new Date(Date.now() + captureLimits.claimMs + 1000));
      if (later.state !== "draw") throw new Error("Expected drawings.");
      expect(later.frames.flatMap((frame) => frame.drawings)).toContainEqual(drawing);
    });

    it("should remove the images of content that left the board, and ask for the new content", async () => {
      const { captureId, drawing } = await startedHome();
      upload(captureId, 1440, 600, [9000]);
      await finishCapture(users.ada, captureId);
      await getDb().update(frameCapture).set({ startedAt: new Date(Date.now() - 3_600_000) }).where(eq(frameCapture.id, captureId));
      await getDb().update(artifact).set({ content: board("Start") }).where(eq(artifact.id, canvasId));
      const needed = await capturesNeeded(users.ada, canvasId);
      if (needed.state !== "draw") throw new Error("Expected drawings.");
      const hashes = needed.frames.flatMap((frame) => frame.drawings.map((candidate) => candidate.frameHash));
      expect(hashes).not.toContain(drawing.frameHash);
      expect(hashes).toHaveLength(4);
      expect(await captureById(captureId)).toBeUndefined();
      expect(bucket.deleted).toEqual([captureObjectKey(canvasId, captureId, 1)]);
    });

    it("should give a frame a new hash when a file it shows is replaced", async () => {
      const phone = async () => {
        const needed = await capturesNeeded(users.ada, canvasId);
        if (needed.state !== "draw") throw new Error("Expected drawings.");
        return needed.frames.find((frame) => frame.width === 390)?.drawings.map((drawing) => drawing.frameHash);
      };
      const before = await phone();
      await getDb().update(artifactFile).set({ key: `files/${fileId}/chart-2.png` }).where(eq(artifactFile.id, fileId));
      const after = await phone();
      await getDb().update(artifactFile).set({ key: `files/${fileId}/chart.png` }).where(eq(artifactFile.id, fileId));
      expect(after).toHaveLength(2);
      expect(after).not.toEqual(before);
      expect(await phone()).toEqual(before);
    });
  });

  describe("startCapture", () => {
    it("should store a pending capture and sign one upload for each part, each for its exact size and type", async () => {
      const { captureId, uploads, drawing } = await startedHome([9000, 8000, 7000], 2000);
      expect(uploads.map((upload) => upload.headers)).toEqual([9000, 8000, 7000].map((bytes) => ({ "Content-Type": "image/webp", "Content-Length": String(bytes) })));
      expect(bucket.presigned.map((signed) => signed.key)).toEqual([1, 2, 3].map((part) => captureObjectKey(canvasId, captureId, part)));
      expect(bucket.presigned.every((signed) => signed.expiresIn === captureLimits.uploadUrlSeconds)).toBe(true);
      expect(await captureById(captureId)).toMatchObject({ artifactId: canvasId, frameHash: drawing.frameHash, mode: "light", status: "pending", partCount: 3, columns: 1, width: 1440, height: 2000, drawnHeight: 2000, contentType: "image/webp", bytes: 24_000, partial: false, capturedBy: users.ada, capturedAt: null });
    });

    it("should refuse a reader who may not edit the canvas, and store nothing", async () => {
      const drawing = await homeLight();
      const before = await counted("frameCaptureStartByArtifact", canvasId);
      await expect(startCapture(users.bo, startInput(drawing.frameHash))).rejects.toThrow("Artifact not found.");
      expect(await captures()).toEqual([]);
      expect(bucket.presigned).toEqual([]);
      // The canvas's own budget is not used up by someone who may not edit it, and it is by someone who may.
      expect(await counted("frameCaptureStartByArtifact", canvasId)).toBe(before);
      await startCapture(users.ada, startInput(drawing.frameHash));
      expect(await counted("frameCaptureStartByArtifact", canvasId)).toBe(before + 1);
    });

    it("should refuse content that is not on the board", async () => {
      await expect(startCapture(users.ada, startInput("0".repeat(64)))).rejects.toThrow("This frame changed");
      const drawing = await homeLight();
      await getDb().update(artifact).set({ content: board("Start") }).where(eq(artifact.id, canvasId));
      await expect(startCapture(users.ada, startInput(drawing.frameHash))).rejects.toThrow("This frame changed");
      expect(await captures()).toEqual([]);
    });

    it("should refuse parts that do not fit the frame, a type that is not allowed, and an oversized part", async () => {
      const drawing = await homeLight();
      await expect(startCapture(users.ada, startInput(drawing.frameHash, [9000, 9000], 600))).rejects.toThrow("drawn in 1 part, not 2");
      await expect(startCapture(users.ada, { ...startInput(drawing.frameHash), parts: [{ bytes: 9000, contentType: "image/png" as never }] })).rejects.toThrow();
      await expect(startCapture(users.ada, startInput(drawing.frameHash, [captureLimits.maxPartBytes + 1]))).rejects.toThrow();
      expect(await captures()).toEqual([]);
    });

    it("should refuse when captures are off, and for an artifact that is not a canvas", async () => {
      const drawing = await homeLight();
      vi.stubEnv("FRAME_CAPTURES", "off");
      await expect(startCapture(users.ada, startInput(drawing.frameHash))).rejects.toThrow("Frame images are off here.");
      vi.unstubAllEnvs();
      await expect(startCapture(users.ada, { ...startInput(drawing.frameHash), artifactId: noteId })).rejects.toThrow("Only a canvas");
      expect(await captures()).toEqual([]);
    });

    it("should give two captures of the same content different keys", async () => {
      const first = await startedHome();
      const second = await startCapture(users.ada, startInput(first.drawing.frameHash));
      expect(second.captureId).not.toBe(first.captureId);
      expect(new Set([...first.uploads, ...second.uploads].map((upload) => upload.url)).size).toBe(2);
    });

    it("should refuse a second capture of content that already has a current image", async () => {
      const { captureId, drawing } = await startedHome();
      upload(captureId, 1440, 600, [9000]);
      await finishCapture(users.ada, captureId);
      await expect(startCapture(users.ada, startInput(drawing.frameHash))).rejects.toThrow("already has a current image");
    });

    const row = (frameHash: string, values: Partial<typeof frameCapture.$inferInsert> = {}) => ({ id: randomUUID(), artifactId: canvasId, mode: "light" as const, frameHash, partCount: 1, columns: 1, width: 1440, height: 600, drawnHeight: 600, contentType: "image/webp" as const, bytes: 9000, capturedBy: users.ada, ...values });

    it("should refuse when the person has 16 unfinished captures, and let them start again once those are an hour old", async () => {
      const drawing = await homeLight();
      await getDb().insert(frameCapture).values(Array.from({ length: captureLimits.maxPendingPerUser }, (_, index) => row(`pending-${String(index)}`)));
      await expect(startCapture(users.ada, startInput(drawing.frameHash))).rejects.toThrow("many unfinished frame images");
      await getDb().update(frameCapture).set({ startedAt: new Date(Date.now() - captureLimits.pendingTtlMs - 1000) }).where(eq(frameCapture.artifactId, canvasId));
      expect((await startCapture(users.ada, startInput(drawing.frameHash))).uploads).toHaveLength(1);
    });

    const full = captureLimits.maxParts * captureLimits.maxPartBytes;
    const fullRows = (frameHash: (index: number) => string, mode: "light" | "dark") =>
      Array.from({ length: Math.ceil(captureLimits.maxCanvasBytes / full) }, (_, index) => row(frameHash(index), { status: "ready", bytes: full, mode }));

    it("should refuse when the canvas holds as many images of its current content as it can", async () => {
      const drawing = await homeLight();
      // The board's own dark drawing: images of current content are what the cap counts.
      const needed = await capturesNeeded(users.ada, canvasId);
      const dark = needed.state === "draw" ? needed.frames.find((frame) => frame.width === 1440)?.drawings.find((candidate) => candidate.mode === "dark") : undefined;
      if (!dark) throw new Error("Expected the home frame in dark.");
      await getDb().insert(frameCapture).values(fullRows(() => dark.frameHash, "dark"));
      await expect(startCapture(users.ada, startInput(drawing.frameHash))).rejects.toThrow("as many frame images as it can");
    });

    it("should not count images of content that left the board toward the canvas's cap", async () => {
      const drawing = await homeLight();
      await getDb().insert(frameCapture).values(fullRows((index) => `left-${String(index)}`, "light"));
      expect((await startCapture(users.ada, startInput(drawing.frameHash))).uploads).toHaveLength(1);
    });

    it("should refuse a drawing that is shorter than the least height its frame asks for", async () => {
      const tall = JSON.stringify({ version: 1, frames: [{ id: "home", name: "Home", width: 1440, height: 900, spec: heading("Home") }] });
      await getDb().update(artifact).set({ content: tall }).where(eq(artifact.id, canvasId));
      const drawing = await homeLight();
      await expect(startCapture(users.ada, startInput(drawing.frameHash, [9000], 899))).rejects.toThrow("The drawing is shorter than its frame.");
      expect(await captures()).toEqual([]);
      expect((await startCapture(users.ada, startInput(drawing.frameHash, [9000, 8000], 900))).uploads).toHaveLength(2);
    });

    it("should refuse when the capture does not fit the person's file storage quota", async () => {
      const drawing = await homeLight();
      vi.stubEnv("STORAGE_QUOTA_FILE_BYTES", "5000");
      await expect(startCapture(users.ada, startInput(drawing.frameHash))).rejects.toThrow("Files in your account use");
      expect(await captures()).toEqual([]);
    });
  });

  describe("finishCapture", () => {
    it("should make the capture the current image when every stored part is what the drawing said", async () => {
      const { captureId } = await startedHome([9000, 8000, 7000], 2000);
      upload(captureId, 1440, 2000, [9000, 8000, 7000]);
      expect(await finishCapture(users.ada, captureId)).toEqual({ current: true });
      const stored = await captureById(captureId);
      expect(stored).toMatchObject({ status: "ready" });
      expect(stored?.capturedAt).toBeInstanceOf(Date);
      expect(bucket.deleted).toEqual([]);
    });

    it("should accept JPEG parts when the drawing said JPEG", async () => {
      const drawing = await homeLight();
      const { captureId } = await startCapture(users.ada, { ...startInput(drawing.frameHash), parts: [{ bytes: 9000, contentType: "image/jpeg" }] });
      upload(captureId, 1440, 600, [9000], () => ({ contentType: "image/jpeg", start: jpegStart(1440, 600) }));
      expect(await finishCapture(users.ada, captureId)).toEqual({ current: true });
    });

    it.each([
      { name: "a part is missing", sizes: [9000], change: () => ({}) },
      { name: "a part is not the picture type it claims", sizes: [9000, 8000], change: (part: number) => (part === 2 ? { start: pngStart() } : {}) },
      { name: "a part is stored as another type", sizes: [9000, 8000], change: (part: number) => (part === 2 ? { contentType: "text/html" } : {}) },
      { name: "a part is a JPEG where the drawing said WebP", sizes: [9000, 8000], change: (part: number) => (part === 1 ? { start: jpegStart(1440, 840) } : {}) },
      { name: "a part is larger than a part can be", sizes: [9000, 8000], change: (part: number) => (part === 1 ? { size: captureLimits.maxPartBytes + 1 } : {}) },
      { name: "a part has another byte size than the drawing said", sizes: [9000, 8001], change: () => ({}) },
      { name: "a part has the wrong pixel size", sizes: [9000, 8000], change: (part: number) => (part === 2 ? { start: webpStart(1440, 840) } : {}) },
    ])("should refuse and remove the capture when $name", async ({ sizes, change }) => {
      const { captureId } = await startedHome([9000, 8000], 1000);
      upload(captureId, 1440, 1000, sizes, change);
      await expect(finishCapture(users.ada, captureId)).rejects.toThrow("The frame image was refused and removed.");
      expect((await captureById(captureId))?.status).toBe("removed");
      expect(bucket.objects.size).toBe(0);
      // A second try finds nothing to finish.
      await expect(finishCapture(users.ada, captureId)).rejects.toThrow("Frame image not found.");
    });

    it("should count every finish call toward the person's limit, and refuse past it before reading storage", async () => {
      const { captureId } = await startedHome();
      upload(captureId, 1440, 600, [9000]);
      const before = { ada: await counted("frameCaptureFinish", users.ada), bo: await counted("frameCaptureFinish", users.bo) };
      // Someone else's call counts for them, and finds nothing to finish.
      await expect(finishCapture(users.bo, captureId)).rejects.toThrow("Frame image not found.");
      expect(await counted("frameCaptureFinish", users.bo)).toBe(before.bo + 1);
      expect(await counted("frameCaptureFinish", users.ada)).toBe(before.ada);
      // At the limit, the call is refused before the capture or its parts are read.
      await getDb().update(rateLimitBucket).set({ count: rateLimits.frameCaptureFinish.limit }).where(eq(rateLimitBucket.key, `frameCaptureFinish:${users.ada}`));
      await finishCapture(users.ada, randomUUID()).catch(() => undefined);
      await getDb().update(rateLimitBucket).set({ count: rateLimits.frameCaptureFinish.limit }).where(eq(rateLimitBucket.key, `frameCaptureFinish:${users.ada}`));
      const asked = bucket.heads.length;
      await expect(finishCapture(users.ada, captureId)).rejects.toThrow("finished a lot of frame images");
      expect(bucket.heads.length).toBe(asked);
      expect((await captureById(captureId))?.status).toBe("pending");
      await getDb().delete(rateLimitBucket).where(eq(rateLimitBucket.key, `frameCaptureFinish:${users.ada}`));
      expect(await finishCapture(users.ada, captureId)).toEqual({ current: true });
      expect(await counted("frameCaptureFinish", users.ada)).toBe(1);
    });

    it("should say a part is empty, not too large, when it holds no bytes", async () => {
      const { captureId } = await startedHome([9000, 8000], 1000);
      upload(captureId, 1440, 1000, [9000, 8000], (part) => (part === 2 ? { size: 0 } : {}));
      await expect(finishCapture(users.ada, captureId)).rejects.toThrow("Part 2 is empty or could not be read.");
      expect((await captureById(captureId))?.status).toBe("removed");
    });

    it("should refuse someone who did not start the capture, and leave it as it was", async () => {
      const { captureId } = await startedHome();
      upload(captureId, 1440, 600, [9000]);
      await expect(finishCapture(users.bo, captureId)).rejects.toThrow("Frame image not found.");
      await expect(finishCapture(users.bo, "not-an-id")).rejects.toThrow();
      expect((await captureById(captureId))?.status).toBe("pending");
      expect(bucket.objects.size).toBe(1);
    });

    it("should refuse and remove a capture when the person who started it may no longer edit the canvas", async () => {
      const { captureId } = await startedHome();
      upload(captureId, 1440, 600, [9000]);
      // The capture now belongs to someone who cannot edit, as after losing access.
      await getDb().update(frameCapture).set({ capturedBy: users.bo }).where(eq(frameCapture.id, captureId));
      await expect(finishCapture(users.bo, captureId)).rejects.toThrow("Artifact not found.");
      expect((await captureById(captureId))?.status).toBe("removed");
      expect(bucket.objects.size).toBe(0);
    });

    it("should refuse and remove a capture when its content left the board while it was drawn", async () => {
      const { captureId } = await startedHome();
      upload(captureId, 1440, 600, [9000]);
      await getDb().update(artifact).set({ content: board("Start") }).where(eq(artifact.id, canvasId));
      await expect(finishCapture(users.ada, captureId)).rejects.toThrow("This frame changed");
      expect((await captureById(captureId))?.status).toBe("removed");
    });

    it("should refuse when captures are off, and keep the capture for its normal end", async () => {
      const { captureId } = await startedHome();
      upload(captureId, 1440, 600, [9000]);
      vi.stubEnv("FRAME_CAPTURES", "off");
      await expect(finishCapture(users.ada, captureId)).rejects.toThrow("Frame images are off here.");
      expect((await captureById(captureId))?.status).toBe("pending");
    });

    it("should keep one current image when two captures of the same content both finish", async () => {
      const first = await startedHome();
      const second = await startCapture(users.ada, startInput(first.drawing.frameHash));
      upload(first.captureId, 1440, 600, [9000]);
      upload(second.captureId, 1440, 600, [9000]);
      expect(await finishCapture(users.ada, first.captureId)).toEqual({ current: true });
      await expect(finishCapture(users.ada, second.captureId)).rejects.toThrow("Frame image not found.");
      expect((await captures()).filter((capture) => capture.status === "ready").map((capture) => capture.id)).toEqual([first.captureId]);
      // The other capture's parts are gone, and the current image's parts are untouched.
      expect([...bucket.objects.keys()]).toEqual([captureObjectKey(canvasId, first.captureId, 1)]);
    });
  });
});
