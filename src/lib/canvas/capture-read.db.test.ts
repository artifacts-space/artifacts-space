import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as R2 from "@/lib/files/r2";
import type * as ThemeContext from "@/lib/themes/artifact-theme-context";

/*
 * Reading a frame capture against a real Postgres: who gets an image, which
 * image, and what happens to one whose stored bytes no longer pass their
 * check. The access check is the real one, so a test here fails when an
 * image is wrongly handed out. R2 is a map in memory. It runs only when
 * TEST_DATABASE_URL names a throwaway local database with the migrations
 * applied; never point it at a shared one.
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

describe.runIf(Boolean(databaseUrl))("reading frame captures with a database", async () => {
  const { eq, inArray, like, or } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { frameCapture } = await import("@/db/frame-capture-schema");
  const { artifact, rateLimitBucket, user } = await import("@/db/schema");
  const { rateLimits } = await import("@/lib/abuse/limits");
  const { generatePublicId } = await import("@/lib/public-id");
  const { parseArtifactThemeInput } = await import("@/lib/themes/artifact-theme");
  const { DEFAULT_THEME_ID, themePresets } = await import("@/lib/themes/presets");
  const { jpegStart, pngStart, webpStart } = await import("@/test/fake-capture-bucket");
  const { canvasFull, frameHasProblems, imagesOff, modeNotDrawn, noSuchPart, notDrawnYet, themeUnreadable } = await import("./capture-read-rules");
  const { captureGeometry, captureLimits, captureObjectKey, partBox } = await import("./capture-rules");
  const { frameImageStatesFor, readFrameImage } = await import("./capture-read");
  const { finishCapture, startCapture } = await import("./captures");
  const { loadCaptureBoard } = await import("./captures-board");

  const tag = randomUUID().slice(0, 8);
  const users = { ada: `capread-${tag}-ada`, bo: `capread-${tag}-bo` };
  const canvasId = randomUUID();
  const noteId = randomUUID();
  const publicId = generatePublicId();
  const notePublicId = generatePublicId();

  const heading = (text: string) => ({ version: 1, root: "page", elements: { page: { type: "Stack", props: { gap: "md" }, children: ["title"] }, title: { type: "Heading", props: { text, level: 1 } } } });
  const board = (title: string) => JSON.stringify({
    version: 1,
    frames: [
      { id: "home", name: "Home", width: 1440, spec: heading(title) },
      { id: "broken", name: "Broken", width: 390, spec: { version: 1, root: "page", elements: { page: { type: "NoSuchComponent", props: {} } } } },
      // No id of its own: the frame tools hand out "frame-3". A missing id is a problem, so the frame is never drawn.
      { name: "Unnamed", width: 390, spec: heading("Third") },
    ],
  });

  type Mode = "light" | "dark";
  const counted = async (name: string, subject: string) => (await getDb().select().from(rateLimitBucket).where(eq(rateLimitBucket.key, `${name}:${subject}`))).reduce((sum, bucketRow) => sum + bucketRow.count, 0);
  const captureById = async (id: string) => (await getDb().select().from(frameCapture).where(eq(frameCapture.id, id)))[0];
  const read = (userId: string, input: { frameId?: string; mode?: Mode; part?: number; as?: "image" | "link" } = {}, now?: Date) => readFrameImage(userId, { publicId, frameId: "home", ...input }, now);
  /** A moment after the upload URLs of a capture drawn now have ended. */
  const uploadsEnded = () => new Date(Date.now() + captureLimits.removalGraceMs + 1000);

  async function canvasRow() {
    const [row] = await getDb().select().from(artifact).where(eq(artifact.id, canvasId));
    if (!row) throw new Error("No canvas.");
    return row;
  }

  /** The hash of a frame's current content in a mode, as the server makes it. */
  async function hashOf(frameId: string, mode: Mode) {
    const frame = (await loadCaptureBoard(await canvasRow())).frames.find((candidate) => candidate.id === frameId);
    const drawing = frame?.drawings.find((candidate) => candidate.mode === mode);
    if (!frame || !drawing) throw new Error("Expected a drawing.");
    return { frameHash: drawing.frameHash, width: frame.width };
  }

  /** The bytes a part of this size holds here: a WebP header of exactly the part's pixel size. */
  function partBytes(width: number, height: number, part: number) {
    const box = partBox(captureGeometry(width, height), width, part);
    return webpStart(box?.width ?? 0, box?.height ?? 0);
  }

  /** Draws a frame as an editor's tab does: starts a capture, puts its parts in the bucket, and finishes it. Returns the capture's id. */
  async function draw(frameId = "home", mode: Mode = "light", height = 600, partial = false) {
    const { frameHash, width } = await hashOf(frameId, mode);
    const partCount = captureGeometry(width, height).partCount;
    const started = await startCapture(users.ada, { artifactId: canvasId, frameHash, mode, height, partial, parts: Array.from({ length: partCount }, () => ({ bytes: 9000, contentType: "image/webp" as const })) });
    for (let part = 1; part <= partCount; part += 1) bucket.objects.set(captureObjectKey(canvasId, started.captureId, part), { size: 9000, contentType: "image/webp", start: partBytes(width, height, part) });
    expect(await finishCapture(users.ada, started.captureId)).toEqual({ current: true });
    return started.captureId;
  }

  const refusal = async (result: ReturnType<typeof read>) => {
    const answer = await result;
    if (answer.state !== "refused") throw new Error(`Expected a refusal, got ${answer.state}.`);
    return answer.refusal;
  };

  beforeAll(async () => {
    const db = getDb();
    await db.insert(user).values(Object.values(users).map((id) => ({ id, name: id, email: `${id}@example.com` })));
    // Public, so the other person may read both artifacts but may not edit them.
    const shared = { userId: users.ada, updatedBy: users.ada, visibility: "public" as const };
    await db.insert(artifact).values([
      { ...shared, id: canvasId, title: "Board", content: board("Home"), kind: "canvas", shareId: randomUUID().replaceAll("-", ""), publicId },
      { ...shared, id: noteId, title: "Note", content: "Hello", kind: "markdown", shareId: randomUUID().replaceAll("-", ""), publicId: notePublicId },
    ]);
  });

  beforeEach(() => {
    bucket.objects.clear();
    bucket.deleted.length = 0;
    bucket.heads.length = 0;
    bucket.reads.length = 0;
    bucket.links.length = 0;
    bucket.state.configured = true;
    bucket.state.deletesFail = false;
    theme.fails = false;
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const db = getDb();
    await db.delete(frameCapture).where(or(eq(frameCapture.artifactId, canvasId), inArray(frameCapture.capturedBy, Object.values(users))));
    await db.update(artifact).set({ content: board("Home"), theme: null }).where(eq(artifact.id, canvasId));
    await db.delete(rateLimitBucket).where(or(like(rateLimitBucket.key, `%capread-${tag}-%`), like(rateLimitBucket.key, `%${canvasId}`)));
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(artifact).where(inArray(artifact.id, [canvasId, noteId]));
    await db.delete(user).where(inArray(user.id, Object.values(users)));
  });

  describe("who gets an image", () => {
    it("should hand the stored picture and its facts to someone who may edit the canvas", async () => {
      const captureId = await draw();
      const result = await read(users.ada);
      if (result.state !== "image") throw new Error(`Expected an image, got ${result.state}.`);
      expect(result.bytes).toEqual(partBytes(1440, 600, 1));
      expect(result.facts).toMatchObject({ frameId: "home", mode: "light", part: 1, partCount: 1, covers: { x: 0, y: 0, width: 1440, height: 600 }, frameWidth: 1440, frameHeight: 600, drawnHeight: 600, contentType: "image/webp", partial: false });
      expect(result.facts.drawnAt).toBe((await captureById(captureId))?.capturedAt?.toISOString());
      expect(bucket.reads).toEqual([captureObjectKey(canvasId, captureId, 1)]);
    });

    it("should refuse a reader of a public canvas as not found, and read nothing from storage", async () => {
      await draw();
      bucket.heads.length = 0;
      await expect(read(users.bo)).rejects.toThrow("Artifact not found, or you cannot edit it. Only people and agents who can edit a canvas get images of its frames.");
      await expect(read(users.bo, { as: "link" })).rejects.toThrow("Artifact not found, or you cannot edit it.");
      expect(bucket.reads).toEqual([]);
      expect(bucket.heads).toEqual([]);
      expect(bucket.links).toEqual([]);
    });

    it("should give a reader the same words for a canvas they may read and for one that does not exist", async () => {
      const words = async (id: string) => readFrameImage(users.bo, { publicId: id, frameId: "home" }).then(() => "an answer", (error: unknown) => (error instanceof Error ? error.message : "no message"));
      expect(await words(publicId)).toBe(await words("aaaaaaaaaaaaaaaaaaaaaa"));
    });

    it("should refuse an artifact that is not a canvas", async () => {
      await expect(readFrameImage(users.ada, { publicId: notePublicId, frameId: "home" })).rejects.toThrow("This artifact is markdown content, not a canvas, so it has no frames.");
    });

    it("should report image states to someone who may edit, and nothing at all to a reader", async () => {
      await draw("home", "light");
      const states = await frameImageStatesFor(users.ada, publicId);
      // Only frames the board draws are listed: the two with problems have no entry.
      expect([...(states ?? [])]).toEqual([["home", { light: "current", dark: "none" }]]);
      expect(await frameImageStatesFor(users.bo, publicId)).toBeNull();
      expect(await frameImageStatesFor(users.ada, notePublicId)).toBeNull();
      vi.stubEnv("FRAME_CAPTURES", "off");
      expect(await frameImageStatesFor(users.ada, publicId)).toBeNull();
    });
  });

  describe("which image", () => {
    it("should give light when no mode is asked for, and dark only when dark is asked for and drawn", async () => {
      const light = await draw("home", "light");
      expect(await refusal(read(users.ada, { mode: "dark" }))).toEqual(notDrawnYet);
      const dark = await draw("home", "dark");
      const defaulted = await read(users.ada);
      const asked = await read(users.ada, { mode: "dark" });
      expect(defaulted).toMatchObject({ state: "image", facts: { mode: "light" } });
      expect(asked).toMatchObject({ state: "image", facts: { mode: "dark" } });
      expect(bucket.reads).toEqual([captureObjectKey(canvasId, light, 1), captureObjectKey(canvasId, dark, 1)]);
    });

    it("should give the one mode a theme pins when none is asked for, and refuse the other", async () => {
      const preset = themePresets.find((candidate) => candidate.id === DEFAULT_THEME_ID);
      const pinned = parseArtifactThemeInput({ ...preset?.theme, mode: "dark" });
      if (!pinned.ok) throw new Error(pinned.message);
      await getDb().update(artifact).set({ theme: pinned.theme }).where(eq(artifact.id, canvasId));
      await draw("home", "dark");
      expect(await read(users.ada)).toMatchObject({ state: "image", facts: { mode: "dark" } });
      expect(await refusal(read(users.ada, { mode: "light" }))).toEqual(modeNotDrawn("dark", "light"));
      expect([...((await frameImageStatesFor(users.ada, publicId)) ?? [])][0]).toEqual(["home", { dark: "current" }]);
    });

    it("should hand out each part of a tall frame with the pixels it covers, and refuse a part past the last", async () => {
      const captureId = await draw("home", "light", 3120);
      for (const part of [1, 2, 3, 4]) {
        const result = await read(users.ada, { part });
        if (result.state !== "image") throw new Error(`Expected part ${String(part)}.`);
        expect(result.facts).toMatchObject({ part, partCount: 4, covers: partBox(captureGeometry(1440, 3120), 1440, part), frameHeight: 3120 });
        expect(result.bytes).toEqual(partBytes(1440, 3120, part));
      }
      expect(bucket.reads).toEqual([1, 2, 3, 4].map((part) => captureObjectKey(canvasId, captureId, part)));
      expect(await refusal(read(users.ada, { part: 5 }))).toEqual(noSuchPart(4));
      expect(bucket.reads).toHaveLength(4);
    });

    it("should never hand out an older image once the frame's content changed", async () => {
      const captureId = await draw();
      await getDb().update(artifact).set({ content: board("Start") }).where(eq(artifact.id, canvasId));
      expect(await refusal(read(users.ada))).toEqual(notDrawnYet);
      expect(await refusal(read(users.ada, { as: "link" }))).toEqual(notDrawnYet);
      expect(bucket.reads).toEqual([]);
      expect(bucket.links).toEqual([]);
      // The old capture is left for the next open canvas to remove; it is only never served.
      expect((await captureById(captureId))?.status).toBe("ready");
    });

    it("should say no image yet when nothing was drawn, or a drawing is still uploading", async () => {
      expect(await refusal(read(users.ada))).toEqual(notDrawnYet);
      const { frameHash } = await hashOf("home", "light");
      const started = await startCapture(users.ada, { artifactId: canvasId, frameHash, mode: "light", height: 600, partial: false, parts: [{ bytes: 9000, contentType: "image/webp" }] });
      bucket.objects.set(captureObjectKey(canvasId, started.captureId, 1), { size: 9000, contentType: "image/webp", start: partBytes(1440, 600, 1) });
      expect(await refusal(read(users.ada))).toEqual(notDrawnYet);
      expect(bucket.reads).toEqual([]);
    });

    it("should say the capture is partial when a picture could not be drawn", async () => {
      await draw("home", "light", 600, true);
      expect(await read(users.ada)).toMatchObject({ state: "image", facts: { partial: true } });
    });
  });

  describe("no image, and why", () => {
    it("should say the frame has problems when the board does not draw it", async () => {
      expect(await refusal(read(users.ada, { frameId: "broken" }))).toEqual(frameHasProblems);
    });

    it("should know a frame without an id of its own by the stand-in id the frame tools hand out", async () => {
      // "frame-3" is on the canvas, so it is not "no such frame"; its missing id is a problem, so it is not drawn.
      expect(await refusal(read(users.ada, { frameId: "frame-3" }))).toEqual(frameHasProblems);
    });

    it("should refuse a frame id the canvas does not have, and list the ids it has", async () => {
      await expect(read(users.ada, { frameId: "pricing" })).rejects.toThrow('No frame has the id "pricing". The frames are: "home", "broken", "frame-3".');
    });

    it("should say the canvas cannot be read when its content is not a canvas at all", async () => {
      await getDb().update(artifact).set({ content: "{ not json" }).where(eq(artifact.id, canvasId));
      await expect(read(users.ada)).rejects.toThrow("This canvas cannot be read, so it has no frames to draw. Read its problems with canvas_frames_list.");
      expect([...((await frameImageStatesFor(users.ada, publicId)) ?? [])]).toEqual([]);
    });

    it("should say images are off before it reads or counts anything, whoever asks", async () => {
      await draw();
      const before = { ada: await counted("frameImageRead", users.ada), bo: await counted("frameImageRead", users.bo) };
      for (const [name, value] of [["FRAME_CAPTURES", "off"], ["VERCEL_ENV", "preview"]] as const) {
        vi.stubEnv(name, value);
        expect(await refusal(read(users.ada))).toEqual(imagesOff);
        expect(await refusal(read(users.bo))).toEqual(imagesOff);
        vi.unstubAllEnvs();
      }
      bucket.state.configured = false;
      expect(await refusal(read(users.ada))).toEqual(imagesOff);
      expect(bucket.reads).toEqual([]);
      expect(await counted("frameImageRead", users.ada)).toBe(before.ada);
      expect(await counted("frameImageRead", users.bo)).toBe(before.bo);
    });

    it("should say the theme could not be read, and hand out nothing, when the team's theme fails", async () => {
      await draw();
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      theme.fails = true;
      expect(await refusal(read(users.ada))).toEqual(themeUnreadable);
      expect(await frameImageStatesFor(users.ada, publicId)).toBeNull();
      expect(bucket.reads).toEqual([]);
      logged.mockRestore();
    });

    it("should name the canvas's cap only when the canvas really is at it", async () => {
      const dark = await hashOf("home", "dark");
      const row = (bytes: number) => ({ id: randomUUID(), artifactId: canvasId, mode: "dark" as const, frameHash: dark.frameHash, status: "ready" as const, partCount: 12, columns: 1, width: 1440, height: 9000, drawnHeight: 9000, contentType: "image/webp" as const, bytes, partial: false, capturedBy: users.ada, capturedAt: new Date() });
      const largest = captureLimits.maxParts * captureLimits.maxPartBytes;
      const count = Math.floor(captureLimits.maxCanvasBytes / largest);
      // Just under the cap: room for one more part, so the cap is not why.
      await getDb().insert(frameCapture).values(Array.from({ length: count }, () => row(largest)));
      expect(await refusal(read(users.ada))).toEqual(notDrawnYet);
      await getDb().insert(frameCapture).values(row(captureLimits.maxCanvasBytes - count * largest));
      expect(await refusal(read(users.ada))).toEqual(canvasFull);
      // Images of content that left the board do not count: the next open canvas removes them.
      await getDb().update(frameCapture).set({ frameHash: "f".repeat(64) }).where(eq(frameCapture.artifactId, canvasId));
      expect(await refusal(read(users.ada))).toEqual(notDrawnYet);
    });
  });

  describe("the stored bytes are checked again", () => {
    const swaps: [string, (key: string) => void][] = [
      ["has another pixel size", (key) => bucket.objects.set(key, { size: 9000, contentType: "image/webp", start: webpStart(1440, 599) })],
      ["is another kind of picture", (key) => bucket.objects.set(key, { size: 9000, contentType: "image/webp", start: pngStart() })],
      ["is a JPEG stored as WebP", (key) => bucket.objects.set(key, { size: 9000, contentType: "image/webp", start: jpegStart(1440, 600) })],
      ["is stored under another type", (key) => bucket.objects.set(key, { size: 9000, contentType: "text/html", start: webpStart(1440, 600) })],
      ["is larger than a part can be", (key) => bucket.objects.set(key, { size: captureLimits.maxPartBytes + 1, contentType: "image/webp", start: webpStart(1440, 600) })],
      ["is gone", (key) => bucket.objects.delete(key)],
    ];

    it.each(swaps)("should not hand out the picture, and should remove the capture, when the stored part %s", async (_name, swap) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const captureId = await draw();
      const key = captureObjectKey(canvasId, captureId, 1);
      swap(key);
      expect(await read(users.ada)).toEqual({ state: "refused", refusal: notDrawnYet });
      expect(bucket.objects.has(key)).toBe(false);
      expect((await captureById(captureId))?.status ?? "gone").not.toBe("ready");
      // The trace names no key and no capture.
      expect(JSON.stringify(logged.mock.calls)).not.toContain(captureId);
      expect(logged.mock.calls).toContainEqual(["[captures] A stored frame image failed its check when it was read, and was removed."]);
      logged.mockRestore();
    });

    it.each(swaps)("should sign no link, and should remove the capture, when the stored part %s", async (_name, swap) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const captureId = await draw();
      swap(captureObjectKey(canvasId, captureId, 1));
      expect(await read(users.ada, { as: "link" }, uploadsEnded())).toEqual({ state: "refused", refusal: notDrawnYet });
      expect(bucket.links).toEqual([]);
      expect((await captureById(captureId))?.status ?? "gone").not.toBe("ready");
      logged.mockRestore();
    });

    it("should check only the part that is asked for, so a good part of the same capture is still read", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const captureId = await draw("home", "light", 3120);
      bucket.objects.set(captureObjectKey(canvasId, captureId, 3), { size: 9000, contentType: "image/webp", start: pngStart() });
      expect((await read(users.ada, { part: 1 })).state).toBe("image");
      expect(await read(users.ada, { part: 3 })).toEqual({ state: "refused", refusal: notDrawnYet });
      // The capture is gone as a whole: its other parts are no longer served either.
      expect(await read(users.ada, { part: 1 })).toEqual({ state: "refused", refusal: notDrawnYet });
      logged.mockRestore();
    });
  });

  describe("a link", () => {
    it("should sign a link to the checked part that works as long as a file link, with the capture's own type, and read no whole object", async () => {
      const captureId = await draw("home", "dark", 3120);
      const result = await read(users.ada, { as: "link", mode: "dark", part: 2 }, uploadsEnded());
      if (result.state !== "link") throw new Error(`Expected a link, got ${result.state}.`);
      const key = captureObjectKey(canvasId, captureId, 2);
      expect(bucket.links).toEqual([{ key, contentType: "image/webp", disposition: `inline; filename="frame-home-dark-2.webp"; filename*=UTF-8''frame-home-dark-2.webp`, expiresIn: 15 * 60 }]);
      expect(result.url).toBe(`https://r2.test/${key}?signed=1`);
      expect(result.facts).toMatchObject({ mode: "dark", part: 2, partCount: 4 });
      expect(bucket.heads.at(-1)).toBe(key);
      expect(bucket.reads).toEqual([]);
    });
  });

  describe("a link to an image drawn moments ago", () => {
    it("should sign no link while the drawer's upload URLs can still work, and hand out the picture meanwhile", async () => {
      const captureId = await draw();
      const early = await refusal(read(users.ada, { as: "link" }));
      expect(early.code).toBe("frame_link_not_ready");
      expect(bucket.links).toEqual([]);
      // The picture goes through the server, which checks the very bytes it hands out, so it does not wait.
      expect((await read(users.ada)).state).toBe("image");
      // The capture is kept: waiting is not a failed check.
      expect((await captureById(captureId))?.status).toBe("ready");
      expect((await read(users.ada, { as: "link" }, uploadsEnded())).state).toBe("link");
    });
  });

  describe("the read limit", () => {
    it("should count every read against the person who asks, before the canvas or storage is read", async () => {
      await draw();
      const before = { ada: await counted("frameImageRead", users.ada), bo: await counted("frameImageRead", users.bo) };
      await read(users.ada);
      await read(users.ada, { as: "link" });
      await read(users.bo).catch(() => undefined);
      expect(await counted("frameImageRead", users.ada)).toBe(before.ada + 2);
      // A reader's refused calls use up only the reader's own budget.
      expect(await counted("frameImageRead", users.bo)).toBe(before.bo + 1);
      expect(rateLimits.frameImageRead).toEqual({ limit: 600, windowSeconds: 3600 });
    });

    it("should refuse a read over the limit before anything is read from storage, and serve again once the hour is over", async () => {
      await draw();
      await read(users.ada);
      await getDb().update(rateLimitBucket).set({ count: rateLimits.frameImageRead.limit }).where(eq(rateLimitBucket.key, `frameImageRead:${users.ada}`));
      const reads = bucket.reads.length;
      await expect(read(users.ada)).rejects.toThrow("You have read a lot of frame images in the last hour.");
      await expect(read(users.ada, { as: "link" })).rejects.toThrow("You have read a lot of frame images in the last hour.");
      expect(bucket.reads.length).toBe(reads);
      expect(bucket.links).toEqual([]);
      await getDb().delete(rateLimitBucket).where(eq(rateLimitBucket.key, `frameImageRead:${users.ada}`));
      expect((await read(users.ada)).state).toBe("image");
    });
  });
});
