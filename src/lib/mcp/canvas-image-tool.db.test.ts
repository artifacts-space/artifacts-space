import { randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type * as NextCache from "next/cache";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as R2 from "@/lib/files/r2";
import type { McpAccess } from "@/lib/oauth/scopes";

/*
 * canvas_frame_image against a real Postgres, through the real MCP server
 * and the real access check: who is handed a frame's picture. Only people
 * and agents who may edit the canvas are; a reader of a public canvas, a
 * signed-in person outside the team, and their read-only connections get
 * no picture, no link, and no word on whether a frame has one. A test here
 * fails when a picture is wrongly handed out. R2 is a map in memory. It
 * runs only when TEST_DATABASE_URL names a throwaway local database with
 * the migrations applied; never a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.BETTER_AUTH_URL ??= "https://artifacts.test";
}

const bucket = await vi.hoisted(async () => (await import("@/test/fake-capture-bucket")).fakeCaptureBucket());
vi.mock("@/lib/files/r2", async (importOriginal) => ({ ...(await importOriginal<typeof R2>()), ...bucket.r2 }));
// The approved version a reader gets is read through the framework's cache, which exists only inside a running app. Here the read goes straight to the database.
vi.mock("next/cache", async (importOriginal) => ({ ...(await importOriginal<typeof NextCache>()), cacheLife: () => undefined, cacheTag: () => undefined }));

describe.runIf(Boolean(databaseUrl))("canvas_frame_image with a database", async () => {
  const { eq, inArray, like, or } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { frameCapture } = await import("@/db/frame-capture-schema");
  const { artifact, rateLimitBucket, team, teamMember, user } = await import("@/db/schema");
  const artifacts = await import("@/lib/artifacts");
  const { captureObjectKey } = await import("@/lib/canvas/capture-rules");
  const { finishCapture, startCapture } = await import("@/lib/canvas/captures");
  const { loadCaptureBoard } = await import("@/lib/canvas/captures-board");
  const { webpStart } = await import("@/test/fake-capture-bucket");
  const { registerCanvasTools } = await import("./canvas-tools");

  const tag = randomUUID().slice(0, 8);
  const owner = `frameimg-${tag}-owner`;
  const member = `frameimg-${tag}-member`;
  const outsider = `frameimg-${tag}-outsider`;
  const teamId = `frameimg-${tag}-team`;
  const claude = { harness: "claude-code" as const, label: null };
  const refusedWords = "Artifact not found, or you cannot edit it. Only people and agents who can edit a canvas get images of its frames.";

  const heading = (text: string) => ({ version: 1, root: "page", elements: { page: { type: "Heading", props: { text } } } });
  const frame = (id: string, text = id) => ({ id, name: `Screen ${id}`, width: 390, spec: heading(text) });
  const oneFrame = JSON.stringify({ version: 1, frames: [frame("home")] });
  const picture = webpStart(390, 500);
  const pictureBase64 = Buffer.from(picture).toString("base64");

  async function row(id: string) {
    const [found] = await getDb().select().from(artifact).where(eq(artifact.id, id)).limit(1);
    if (!found) throw new Error("No such artifact.");
    return found;
  }

  /** The owner's canvas with one frame, shared as asked. */
  async function newCanvas(sharing: { visibility: "private" | "team" | "public"; team?: boolean } = { visibility: "private" }) {
    const made = await artifacts.createArtifact(owner, { title: "Checkout flow", kind: "canvas", content: oneFrame });
    if (sharing.visibility !== "private") await getDb().update(artifact).set({ visibility: sharing.visibility, ...(sharing.team ? { teamId } : {}) }).where(eq(artifact.id, made.id));
    return row(made.id);
  }

  /** Draws the frame's current content in light, as the owner's tab does. */
  async function drawHome(artifactId: string) {
    const board = await loadCaptureBoard(await row(artifactId));
    const drawing = board.frames.find((candidate) => candidate.id === "home")?.drawings.find((candidate) => candidate.mode === "light");
    if (!drawing) throw new Error("Expected a drawing.");
    const started = await startCapture(owner, { artifactId, frameHash: drawing.frameHash, mode: "light", height: 500, partial: false, parts: [{ bytes: 9000, contentType: "image/webp" }] });
    bucket.objects.set(captureObjectKey(artifactId, started.captureId, 1), { size: 9000, contentType: "image/webp", start: picture });
    expect(await finishCapture(owner, started.captureId)).toEqual({ current: true });
    bucket.heads.length = 0;
  }

  interface ToolResult {
    isError?: boolean;
    content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
    structuredContent?: Record<string, unknown>;
  }

  const clients: Client[] = [];

  /** An agent connected as `userId`, with the canvas tools a connection of that access lists. */
  async function agentOf(userId: string, access: McpAccess = "full") {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerCanvasTools(server, userId, access, () => Promise.resolve(claude));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    clients.push(client);
    return async (name: string, args: Record<string, unknown>) => {
      const result = (await client.callTool({ name, arguments: args })) as ToolResult;
      const text = result.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
      const images = result.content.flatMap((block) => (block.type === "image" ? [block] : []));
      return { isError: result.isError === true, text, images, structured: result.structuredContent, whole: JSON.stringify(result) };
    };
  }

  type Agent = Awaited<ReturnType<typeof agentOf>>;

  /** Everything an agent can ask about a frame's image, and that none of it holds a picture, a link, or an image state. */
  async function expectNothing(agent: Agent, publicId: string, words = refusedWords) {
    for (const args of [{}, { as: "link" }, { mode: "dark" }, { part: 2 }]) {
      const result = await agent("canvas_frame_image", { id: publicId, frameId: "home", ...args });
      expect(result.isError, JSON.stringify(args)).toBe(true);
      expect(result.text, JSON.stringify(args)).toBe(words);
      expect(result.images).toEqual([]);
      expect(result.whole).not.toContain(pictureBase64);
      expect(result.whole).not.toContain("r2.test");
    }
    for (const [name, args] of [["canvas_frames_list", {}], ["canvas_frame_get", { frameId: "home" }]] as const) {
      const result = await agent(name, { id: publicId, ...args });
      expect(result.text, name).not.toContain('"image"');
    }
    expect(bucket.reads).toEqual([]);
    expect(bucket.heads).toEqual([]);
    expect(bucket.links).toEqual([]);
  }

  beforeAll(async () => {
    await getDb().insert(user).values([owner, member, outsider].map((id) => ({ id, name: id, email: `${id}@example.com` })));
    await getDb().insert(team).values({ id: teamId, name: "Frame image team", slug: teamId, personal: false });
    await getDb().insert(teamMember).values([
      { id: `${teamId}-o`, teamId, userId: owner, role: "owner" },
      { id: `${teamId}-m`, teamId, userId: member, role: "member" },
    ]);
  });

  beforeEach(() => {
    bucket.objects.clear();
    bucket.heads.length = 0;
    bucket.reads.length = 0;
    bucket.links.length = 0;
    bucket.state.configured = true;
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  afterAll(async () => {
    const db = getDb();
    const owned = (await db.select({ id: artifact.id }).from(artifact).where(eq(artifact.userId, owner))).map((found) => found.id);
    await db.delete(frameCapture).where(or(inArray(frameCapture.capturedBy, [owner, member, outsider]), owned.length > 0 ? inArray(frameCapture.artifactId, owned) : undefined));
    await db.delete(artifact).where(eq(artifact.userId, owner));
    await db.delete(team).where(eq(team.id, teamId));
    await db.delete(rateLimitBucket).where(or(like(rateLimitBucket.key, `%frameimg-${tag}-%`), ...owned.map((id) => like(rateLimitBucket.key, `%${id}`))));
    await db.delete(user).where(inArray(user.id, [owner, member, outsider]));
  });

  it("should hand the author the picture their browser stored, and say in the frame list that the frame has one", async () => {
    const canvas = await newCanvas();
    await drawHome(canvas.id);
    const agent = await agentOf(owner);
    const result = await agent("canvas_frame_image", { id: canvas.publicId, frameId: "home" });
    expect(result.isError).toBe(false);
    expect(result.images).toEqual([{ type: "image", data: pictureBase64, mimeType: "image/webp" }]);
    expect(result.text).toContain('Frame "home", its current content, in light mode. The image is one part, and covers x 0 to 390 and y 0 to 500');
    expect(result.text).toContain("in a browser by someone who may edit the canvas.");
    expect(result.text).not.toContain(owner);
    expect(result.text).toContain("The frame is 390 wide and 500 tall.");
    expect(result.structured).toBeUndefined();
    const listed = JSON.parse((await agent("canvas_frames_list", { id: canvas.publicId })).text) as { frames: { id: string; image?: unknown }[] };
    expect(listed.frames[0]?.image).toEqual({ light: "current", dark: "none" });
    const one = JSON.parse((await agent("canvas_frame_get", { id: canvas.publicId, frameId: "home" })).text) as { image?: unknown };
    expect(one.image).toEqual({ light: "current", dark: "none" });
  });

  it("should hand a team member who did not write the canvas the picture, because they may edit it", async () => {
    const canvas = await newCanvas({ visibility: "team", team: true });
    await drawHome(canvas.id);
    const result = await (await agentOf(member))("canvas_frame_image", { id: canvas.publicId, frameId: "home" });
    expect(result.images).toEqual([{ type: "image", data: pictureBase64, mimeType: "image/webp" }]);
    const link = await (await agentOf(member))("canvas_frame_image", { id: canvas.publicId, frameId: "home", as: "link" });
    expect(link.images).toEqual([]);
    expect(link.text.endsWith(`: https://r2.test/${bucket.links[0]?.key ?? "none"}?signed=1`)).toBe(true);
  });

  it("should give a reader of a public canvas no picture, no link, and no image state", async () => {
    const canvas = await newCanvas({ visibility: "public", team: true });
    await drawHome(canvas.id);
    await expectNothing(await agentOf(outsider), canvas.publicId);
  });

  it("should give a signed-in person outside the team nothing, in the same words as for a canvas that does not exist", async () => {
    const shared = await newCanvas({ visibility: "team", team: true });
    const mine = await newCanvas();
    await drawHome(shared.id);
    await drawHome(mine.id);
    const stranger = await agentOf(outsider);
    for (const publicId of [shared.publicId, mine.publicId, "aaaaaaaaaaaaaaaaaaaaaa"]) {
      const result = await stranger("canvas_frame_image", { id: publicId, frameId: "home" });
      expect(result.isError).toBe(true);
      expect(result.text).toBe(refusedWords);
      expect(result.images).toEqual([]);
    }
    expect(bucket.reads).toEqual([]);
  });

  it("should give the read-only connection of someone who may not edit nothing, though it lists the tool", async () => {
    const canvas = await newCanvas({ visibility: "public", team: true });
    await drawHome(canvas.id);
    await expectNothing(await agentOf(outsider, "read"), canvas.publicId);
  });

  it("should give an editor's read-only connection the picture: reading is what that connection is for, and access follows the person", async () => {
    const canvas = await newCanvas();
    await drawHome(canvas.id);
    const result = await (await agentOf(owner, "read"))("canvas_frame_image", { id: canvas.publicId, frameId: "home" });
    expect(result.isError).toBe(false);
    expect(result.images).toEqual([{ type: "image", data: pictureBase64, mimeType: "image/webp" }]);
  });

  it("should never show a reader the picture of an edit that waits for approval, while the team sees it", async () => {
    const canvas = await newCanvas({ visibility: "public", team: true });
    const teamAgent = await agentOf(member);
    const base = (JSON.parse((await teamAgent("canvas_frames_list", { id: canvas.publicId })).text) as { baseVersion: string }).baseVersion;
    const saved = await teamAgent("canvas_frame_save", { id: canvas.publicId, frame: frame("home", "Not approved yet"), baseVersion: base });
    expect(JSON.parse(saved.text)).toMatchObject({ edit: "pending" });
    // The owner's tab draws the newest saved content: the edit that waits.
    await drawHome(canvas.id);
    const reader = await agentOf(outsider);
    const listed = await reader("canvas_frames_list", { id: canvas.publicId });
    expect(JSON.parse(listed.text)).toMatchObject({ version: "approved" });
    await expectNothing(reader, canvas.publicId);
    const forTeam = await teamAgent("canvas_frame_image", { id: canvas.publicId, frameId: "home" });
    expect(forTeam.images).toEqual([{ type: "image", data: pictureBase64, mimeType: "image/webp" }]);
  });

  it("should answer a frame nobody has drawn yet as a typed tool error, for someone who may edit", async () => {
    const canvas = await newCanvas();
    const result = await (await agentOf(owner))("canvas_frame_image", { id: canvas.publicId, frameId: "home" });
    expect(result.isError).toBe(true);
    expect(result.text).toBe("No image of this frame yet. It is drawn when someone who may edit the canvas opens it, or comes back to its tab. Ask them to look at the canvas, then call this once more. Do not call it in a loop.");
    expect(result.structured).toEqual({ error: { code: "frame_image_not_drawn", message: result.text } });
    const listed = JSON.parse((await (await agentOf(owner))("canvas_frames_list", { id: canvas.publicId })).text) as { frames: { image?: unknown }[] };
    expect(listed.frames[0]?.image).toEqual({ light: "none", dark: "none" });
  });
});
