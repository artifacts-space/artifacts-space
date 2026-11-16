import { createHash, randomUUID } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";
import { Pool } from "pg";

import { captureGeometry, captureObjectKeys, partBox } from "../src/lib/canvas/capture-rules";
import { readImageHeader } from "../src/lib/files/image-size-rules";

import { cleanUp, createTestArtifact, createTestUser, readyDevUser } from "./support/local-db";
import { localStorageEnabled, localStorageSkipReason, storedObjectExists } from "./support/team-icon-db";
import { expect, test } from "./support/test";

/**
 * Frame captures from end to end: someone who may edit a canvas opens it,
 * and their tab draws every frame, PUTs the parts to file storage, and the
 * server checks each stored part and makes the capture current. These need
 * a local throwaway Postgres (E2E_LOCAL_DB=1) and a local S3-compatible
 * store (E2E_LOCAL_R2=1, R2_ENDPOINT on this machine) that accepts PUTs from
 * the test page's origin, and skip without them. The fixture checks
 * (frame-captures.spec.ts) read the pixels; these prove the real server
 * accepts what the tab uploads, and that an agent of someone who may edit
 * the canvas reads each part back over MCP at exactly its size.
 */

test.skip(!localStorageEnabled(), localStorageSkipReason);

const created: string[] = [];
const createdUsers: string[] = [];
const createdTokens: string[] = [];
let pool: Pool | null = null;

function db(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

test.afterAll(async () => {
  // Captures have no link to their artifact, so they are removed here by hand; the throwaway store keeps their objects.
  if (created.length > 0) await db().query(`delete from frame_capture where artifact_id in (select id from artifact where public_id = any($1))`, [created]);
  if (createdTokens.length > 0) await db().query(`delete from api_token where id = any($1)`, [createdTokens]);
  await pool?.end();
  pool = null;
  await cleanUp(created, createdUsers);
});

const screen = (heading: string) => ({
  version: 1,
  root: "page",
  elements: {
    page: { type: "Stack", props: { gap: "lg" }, children: ["title", "copy", "action"] },
    title: { type: "Heading", props: { text: heading, level: 2 } },
    copy: { type: "Text", props: { text: "Drawn by the tab of someone who may edit this canvas." } },
    action: { type: "Button", props: { label: "Continue" } },
  },
});

const canvasOf = (heading: string) => JSON.stringify({
  version: 1,
  frames: [
    { id: "home-desktop", name: "Home, desktop", width: 1440, spec: screen(heading) },
    { id: "home-phone", name: "Home, phone", width: 390, height: 844, spec: screen(heading) },
  ],
});

interface CaptureRow {
  id: string;
  artifact_id: string;
  mode: string;
  status: string;
  part_count: number;
  width: number;
  height: number;
  content_type: string;
}

async function capturesOf(publicId: string): Promise<CaptureRow[]> {
  const result = await db().query<CaptureRow>(
    `select c.id, c.artifact_id, c.mode, c.status, c.part_count, c.width, c.height, c.content_type
     from frame_capture c join artifact a on a.id = c.artifact_id where a.public_id = $1 order by c.width, c.mode`,
    [publicId],
  );
  return result.rows;
}

async function signIn(page: Page) {
  await page.goto("/api/dev/sign-in");
  await page.waitForURL(/\/app/);
  return readyDevUser();
}

const host = (page: Page) => page.locator("[data-frame-captures]");

/** Both frames have a ready capture in each mode, with every part in storage. */
async function expectCurrentImages(publicId: string) {
  const rows = await capturesOf(publicId);
  expect(rows.map((row) => `${String(row.width)}:${row.mode}:${row.status}`)).toEqual(["390:dark:ready", "390:light:ready", "1440:dark:ready", "1440:light:ready"]);
  for (const row of rows) {
    expect(row.part_count).toBe(captureGeometry(row.width, row.height).partCount);
    expect(row.content_type).toBe("image/webp");
    for (const key of captureObjectKeys(row.artifact_id, row.id, row.part_count)) expect(await storedObjectExists(key), "the part is in storage").toBe(true);
  }
  // The phone frame asks for at least 844 pixels: its image is that tall.
  expect(rows.find((row) => row.width === 390)?.height).toBeGreaterThanOrEqual(844);
}

/** An access token for `userId`, stored as the app stores one: only its hash. */
async function agentTokenFor(userId: string): Promise<string> {
  const id = randomUUID();
  const secret = `e2e-frame-image-${randomUUID()}`;
  await db().query(`insert into api_token (id, user_id, name, prefix, token_hash) values ($1, $2, 'Frame image e2e', 'e2e…', $3)`, [id, userId, createHash("sha256").update(secret).digest("hex")]);
  createdTokens.push(id);
  return secret;
}

interface ImageToolResult {
  isError?: boolean;
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
}

/** Calls canvas_frame_image over the real MCP endpoint, as an agent holding `token`. */
async function frameImage(request: APIRequestContext, token: string, args: Record<string, unknown>): Promise<ImageToolResult> {
  const response = await request.post("/api/mcp", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "canvas_frame_image", arguments: args } },
  });
  expect(response.status(), "the MCP endpoint answers").toBe(200);
  return ((await response.json()) as { result: ImageToolResult }).result;
}

/** An agent of someone who may edit reads every part of every image, and each is a picture of exactly its part's size. */
async function expectAgentReadsEveryPart(request: APIRequestContext, token: string, publicId: string) {
  const frameIds = new Map([[1440, "home-desktop"], [390, "home-phone"]]);
  for (const row of await capturesOf(publicId)) {
    const geometry = captureGeometry(row.width, row.height);
    for (let part = 1; part <= row.part_count; part += 1) {
      const name = `${String(row.width)} ${row.mode} part ${String(part)}`;
      const result = await frameImage(request, token, { id: publicId, frameId: frameIds.get(row.width), mode: row.mode, part });
      expect(result.isError, name).not.toBe(true);
      const [text, image] = result.content;
      if (text?.type !== "text" || image?.type !== "image") throw new Error(`${name}: expected a text block, then a picture.`);
      expect(text.text, name).toContain(`in ${row.mode} mode.`);
      expect(text.text, name).toContain("in a browser by someone who may edit the canvas.");
      expect(image.mimeType, name).toBe(row.content_type);
      const bytes = Buffer.from(image.data, "base64");
      const box = partBox(geometry, row.width, part);
      expect(readImageHeader(bytes), `${name} is a picture of its part's size`).toEqual({ type: row.content_type, width: box?.width, height: box?.height });
    }
  }
}

test.describe("frame captures with a database and file storage", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "the host draws only in a window at least 640 pixels wide");
  });

  test("should draw a canvas's frames from the /app editor, and the server should accept every part and hand each to the editor's agent", async ({ page, request }, testInfo) => {
    const title = `Captured in the app ${testInfo.project.name} ${String(Date.now())}`;
    const userId = await signIn(page);
    const publicId = await createTestArtifact({ userId, title, content: canvasOf("Welcome back"), visibility: "private", theme: null, kind: "canvas" });
    created.push(publicId);

    await page.goto(`/app?artifact=${publicId}`);
    await expect(host(page)).toHaveAttribute("data-frame-capture-passes", "1", { timeout: 60_000 });
    await expectCurrentImages(publicId);

    // The editor's agent reads each part back; someone else's agent gets no picture.
    await expectAgentReadsEveryPart(request, await agentTokenFor(userId), publicId);
    const stranger = await createTestUser();
    createdUsers.push(stranger);
    const refused = await frameImage(request, await agentTokenFor(stranger), { id: publicId, frameId: "home-desktop" });
    expect(refused.isError).toBe(true);
    expect(refused.content).toEqual([{ type: "text", text: "Artifact not found, or you cannot edit it. Only people and agents who can edit a canvas get images of its frames." }]);

    // Coming back to the tab asks again; nothing is needed, so nothing new is stored.
    await page.reload();
    await expect(host(page)).toHaveAttribute("data-frame-capture-passes", "1", { timeout: 60_000 });
    expect(await capturesOf(publicId)).toHaveLength(4);
  });

  test("should draw a canvas's frames from its own page for someone who may edit it, and not for a reader", async ({ page }, testInfo) => {
    const title = `Captured on its page ${testInfo.project.name} ${String(Date.now())}`;
    const publicId = await createTestArtifact({ userId: await signIn(page), title, content: canvasOf("On the page"), visibility: "public", theme: null, kind: "canvas" });
    created.push(publicId);

    await page.goto(`/artifact/${publicId}`);
    await expect(host(page)).toHaveAttribute("data-frame-capture-passes", "1", { timeout: 60_000 });
    await expectCurrentImages(publicId);

    // A reader who is not signed in gets the page with no host at all.
    await page.context().clearCookies();
    await page.goto(`/artifact/${publicId}`);
    await expect(page.locator("main h1")).toHaveText(title);
    await expect(host(page)).toHaveCount(0);
  });
});
