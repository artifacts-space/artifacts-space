import { randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type * as NextCache from "next/cache";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * The canvas frame tools against a real Postgres, through the real MCP
 * server: one frame saved into a stored canvas and read back from History;
 * the base version checked in the UPDATE itself, so two writes from the same
 * read never both land and a person's save is never undone; an uploaded
 * file a frame names attached by the same save; and what a reader outside
 * the team is given while an agent's frame waits for approval. It runs only
 * when TEST_DATABASE_URL names a throwaway local database with the
 * migrations applied; never a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  // Results carry the artifact's link; the site origin never comes from a request.
  process.env.BETTER_AUTH_URL ??= "https://artifacts.test";
}

// The approved version a reader gets is read through the framework's cache, which exists only inside a running app. Here the read goes straight to the database.
vi.mock("next/cache", async (importOriginal) => ({ ...(await importOriginal<typeof NextCache>()), cacheLife: () => undefined, cacheTag: () => undefined }));

describe.runIf(Boolean(databaseUrl))("canvas frame tools with a database", async () => {
  const { eq, inArray, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { artifact, artifactFile, rateLimitBucket, team, teamMember, user } = await import("@/db/schema");
  const artifacts = await import("@/lib/artifacts");
  const { endEditLease, renewEditLease } = await import("@/lib/edits/agent-write-guard");
  const { registerCanvasTools } = await import("./canvas-tools");
  const { registerVersionTools } = await import("./version-tools");

  const tag = randomUUID().slice(0, 8);
  const owner = `frames-${tag}-owner`;
  const outsider = `frames-${tag}-outsider`;
  const teamId = `frames-${tag}-team`;
  const claude = { harness: "claude-code" as const, label: null };

  const heading = (text: string) => ({ version: 1, root: "page", elements: { page: { type: "Heading", props: { text } } } });
  const frame = (id: string, spec: unknown = heading(id)) => ({ id, name: `Screen ${id}`, width: 390, spec });
  const twoFrames = JSON.stringify({ version: 1, frames: [frame("home"), frame("pricing")] });

  /** Save times have millisecond precision; each save here starts in a new millisecond, as people's and agents' saves do. */
  const nextMillisecond = () => new Promise((resolve) => setTimeout(resolve, 2));

  async function row(id: string) {
    const [found] = await getDb().select().from(artifact).where(eq(artifact.id, id)).limit(1);
    if (!found) throw new Error("No such artifact.");
    return found;
  }

  const storedIds = async (id: string) => (JSON.parse((await row(id)).content) as { frames: { id: string }[] }).frames.map((item) => item.id);

  async function newCanvas(content = twoFrames) {
    const made = await artifacts.createArtifact(owner, { title: "Checkout flow", kind: "canvas", content });
    return row(made.id);
  }

  /** The owner's canvas, shared publicly through their team: an agent's saves wait for approval. */
  async function teamPublicCanvas() {
    const made = await newCanvas();
    await getDb().update(artifact).set({ teamId, visibility: "public" }).where(eq(artifact.id, made.id));
    return row(made.id);
  }

  interface ToolResult {
    isError?: boolean;
    content: { type: string; text: string }[];
    structuredContent?: { error?: { code: string; message: string; nextStep: string } };
  }

  const clients: Client[] = [];

  /** An agent connected as `userId`, with the frame tools and History. */
  async function agentOf(userId: string) {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerCanvasTools(server, userId, "full", () => Promise.resolve(claude));
    registerVersionTools(server, userId, "full", () => Promise.resolve(claude));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    clients.push(client);
    return async (name: string, args: Record<string, unknown>) => {
      await nextMillisecond();
      const result = (await client.callTool({ name, arguments: args })) as ToolResult;
      const text = result.content[0]?.text ?? "";
      return { isError: result.isError === true, text, error: result.structuredContent?.error, json: () => JSON.parse(text) as unknown };
    };
  }

  interface Listing {
    version: string;
    editPending: boolean;
    frames: { id: string }[];
    baseVersion?: string;
  }

  beforeAll(async () => {
    await getDb().insert(user).values([
      { id: owner, name: owner, email: `${owner}@example.com` },
      { id: outsider, name: outsider, email: `${outsider}@example.com` },
    ]);
    await getDb().insert(team).values({ id: teamId, name: "Frames team", slug: teamId, personal: false });
    await getDb().insert(teamMember).values({ id: `${teamId}-m`, teamId, userId: owner, role: "owner" });
  });

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close()));
    const db = getDb();
    await db.delete(artifactFile).where(eq(artifactFile.uploaderId, owner));
    await db.delete(artifact).where(eq(artifact.userId, owner));
    await db.delete(team).where(eq(team.id, teamId));
    await db.delete(rateLimitBucket).where(like(rateLimitBucket.key, `%frames-${tag}-%`));
    await db.delete(user).where(inArray(user.id, [owner, outsider]));
  });

  it("should save one frame into a stored canvas, leave the others as written, and file a version History shows came through the agent", async () => {
    const canvas = await newCanvas();
    const call = await agentOf(owner);
    const listed = ((await call("canvas_frames_list", { id: canvas.publicId })).json() as Listing);
    expect(listed.frames.map((item) => item.id)).toEqual(["home", "pricing"]);

    const saved = await call("canvas_frame_save", { id: canvas.publicId, frame: frame("checkout"), after: "home", baseVersion: listed.baseVersion });
    expect(saved.isError, saved.text).toBe(false);
    expect(saved.json()).toMatchObject({ frameId: "checkout", edit: "applied", added: true, frameCount: 3 });

    const stored = JSON.parse((await row(canvas.id)).content) as { frames: unknown[] };
    expect(stored.frames).toEqual([frame("home"), frame("checkout"), frame("pricing")]);

    const history = ((await call("artifacts_versions", { id: canvas.publicId })).json() as { id: string; latest: boolean; harness: string | null }[]);
    expect(history.length).toBeGreaterThanOrEqual(2);
    // An agent saves as the person who connected it; the harness says the save came through an agent.
    expect(history[0]).toMatchObject({ latest: true, harness: "claude-code" });
    expect(history.at(-1)).toMatchObject({ latest: false, harness: null });
    const newest = ((await call("artifacts_versions", { id: canvas.publicId, version: history[0]?.id })).json() as { content: string });
    expect((JSON.parse(newest.content) as { frames: { id: string }[] }).frames.map((item) => item.id)).toEqual(["home", "checkout", "pricing"]);
    const oldest = ((await call("artifacts_versions", { id: canvas.publicId, version: history.at(-1)?.id })).json() as { content: string });
    expect(oldest.content, "the canvas before the frame is still in History").toBe(twoFrames);
  });

  it("should accept the baseVersion of its own save for the next write, and refuse the one it replaced", async () => {
    const canvas = await newCanvas();
    const call = await agentOf(owner);
    const first = ((await call("canvas_frames_list", { id: canvas.publicId })).json() as Listing).baseVersion;
    const saved = ((await call("canvas_frame_save", { id: canvas.publicId, frame: frame("checkout"), baseVersion: first })).json() as { baseVersion: string });

    const next = await call("canvas_frame_update", { id: canvas.publicId, frameId: "checkout", name: "Checkout, phone", baseVersion: saved.baseVersion });
    expect(next.isError, next.text).toBe(false);

    const stale = await call("canvas_frame_delete", { id: canvas.publicId, frameId: "home", baseVersion: first });
    expect(stale.isError).toBe(true);
    expect(stale.error).toMatchObject({ code: "artifact_changed", nextStep: "canvas_frames_list" });
    expect(await storedIds(canvas.id)).toEqual(["home", "pricing", "checkout"]);
  });

  it("should let exactly one of two frame writes from the same read land, so neither undoes the other's frame", async () => {
    const canvas = await newCanvas();
    const [one, two] = await Promise.all([agentOf(owner), agentOf(owner)]);
    const base = ((await one("canvas_frames_list", { id: canvas.publicId })).json() as Listing).baseVersion;

    const results = await Promise.all([
      one("canvas_frame_save", { id: canvas.publicId, frame: frame("from-one"), baseVersion: base }),
      two("canvas_frame_save", { id: canvas.publicId, frame: frame("from-two"), baseVersion: base }),
    ]);
    const landed = results.filter((result) => !result.isError);
    const refused = results.filter((result) => result.isError);
    expect(landed).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]?.error).toMatchObject({ code: "artifact_changed", nextStep: "canvas_frames_list" });
    const winner = (landed[0]?.json() as { frameId: string } | undefined)?.frameId;
    expect(await storedIds(canvas.id)).toEqual(["home", "pricing", winner]);

    // The refused agent reads again and saves: now the canvas has both frames.
    const again = ((await two("canvas_frames_list", { id: canvas.publicId })).json() as Listing).baseVersion;
    const loser = winner === "from-one" ? "from-two" : "from-one";
    const retry = await two("canvas_frame_save", { id: canvas.publicId, frame: frame(loser), baseVersion: again });
    expect(retry.isError, retry.text).toBe(false);
    expect(await storedIds(canvas.id)).toEqual(["home", "pricing", winner, loser]);
  });

  it("should refuse a frame write and keep the person's canvas when a person saved after the agent read it", async () => {
    const canvas = await newCanvas();
    const call = await agentOf(owner);
    const base = ((await call("canvas_frames_list", { id: canvas.publicId })).json() as Listing).baseVersion;
    const personsCanvas = JSON.stringify({ version: 1, frames: [frame("home"), frame("pricing"), frame("by-the-owner")] });
    await nextMillisecond();
    await artifacts.updateArtifact(owner, canvas.id, { content: personsCanvas }, "person", { expectedUpdatedAt: canvas.updatedAt.toISOString() });

    const refused = await call("canvas_frame_delete", { id: canvas.publicId, frameId: "pricing", baseVersion: base });
    expect(refused.isError).toBe(true);
    expect(refused.error?.code).toBe("artifact_changed");
    expect(refused.text).toContain("via the web");
    expect((await row(canvas.id)).content).toBe(personsCanvas);
  });

  it("should let the person's save win, with the agent's frame kept in History, when a frame write lands while the person is typing", async () => {
    const canvas = await newCanvas();
    const call = await agentOf(owner);
    await renewEditLease(canvas.id, owner);
    const base = ((await call("canvas_frames_list", { id: canvas.publicId })).json() as Listing).baseVersion;
    // The same rule as artifacts_update: a write that names the current base lands during a person's lease.
    const saved = await call("canvas_frame_save", { id: canvas.publicId, frame: frame("by-the-agent"), baseVersion: base });
    expect(saved.isError, saved.text).toBe(false);

    // The person saves what they have open, which they started before the agent's frame.
    const personsCanvas = JSON.stringify({ version: 1, frames: [frame("home"), frame("pricing"), frame("by-the-owner")] });
    await nextMillisecond();
    const person = await artifacts.saveArtifactUpdate(owner, canvas.id, { content: personsCanvas }, "person", { expectedUpdatedAt: canvas.updatedAt.toISOString() });
    expect(person?.savedOverAgents).toBe(true);
    expect((await row(canvas.id)).content).toBe(personsCanvas);

    const history = ((await call("artifacts_versions", { id: canvas.publicId })).json() as { id: string; harness: string | null }[]);
    const agents = history.find((version) => version.harness === "claude-code");
    const kept = ((await call("artifacts_versions", { id: canvas.publicId, version: agents?.id })).json() as { content: string });
    expect(kept.content).toContain("by-the-agent");
    await endEditLease(canvas.id, owner);
  });

  it("should attach an uploaded file a frame names in the same save as the frame", async () => {
    const canvas = await newCanvas();
    const fileId = randomUUID();
    await getDb().insert(artifactFile).values({ id: fileId, uploaderId: owner, key: `files/${fileId}/brief.pdf`, filename: "brief.pdf", contentType: "application/pdf", size: 10, status: "ready" });
    const call = await agentOf(owner);
    const base = ((await call("canvas_frames_list", { id: canvas.publicId })).json() as Listing).baseVersion;
    const withFile = { version: 1, root: "page", elements: { page: { type: "Stack", props: {}, children: ["title", "file"] }, title: { type: "Heading", props: { text: "Brief" } }, file: { type: "File", props: { file: fileId } } } };

    const saved = await call("canvas_frame_save", { id: canvas.publicId, frame: frame("brief", withFile), baseVersion: base });
    expect(saved.isError, saved.text).toBe(false);
    const [file] = await getDb().select({ artifactId: artifactFile.artifactId }).from(artifactFile).where(eq(artifactFile.id, fileId));
    expect(file?.artifactId).toBe(canvas.id);
  });

  it("should give a reader outside the team only the approved frames, and no baseVersion, while an agent's frame waits for approval", async () => {
    const canvas = await teamPublicCanvas();
    const [agent, reader] = await Promise.all([agentOf(owner), agentOf(outsider)]);
    const base = ((await agent("canvas_frames_list", { id: canvas.publicId })).json() as Listing).baseVersion;
    const saved = await agent("canvas_frame_save", { id: canvas.publicId, frame: frame("unapproved"), baseVersion: base });
    expect(saved.json()).toMatchObject({ edit: "pending", frameId: "unapproved" });

    const forReader = await reader("canvas_frames_list", { id: canvas.publicId });
    expect(forReader.text).not.toContain("unapproved");
    const listing = (forReader.json() as Listing);
    expect(listing.version).toBe("approved");
    expect(listing.frames.map((item) => item.id)).toEqual(["home", "pricing"]);
    expect(listing).not.toHaveProperty("baseVersion");
    expect(listing).not.toHaveProperty("versionId");

    const frameForReader = await reader("canvas_frame_get", { id: canvas.publicId, frameId: "unapproved" });
    expect(frameForReader.isError).toBe(true);
    expect(frameForReader.text).toBe('No frame has the id "unapproved". The frames are: "home", "pricing".');

    const forTeam = ((await agent("canvas_frames_list", { id: canvas.publicId })).json() as Listing);
    expect(forTeam).toMatchObject({ version: "latest", editPending: true });
    expect(forTeam.frames.map((item) => item.id)).toEqual(["home", "pricing", "unapproved"]);
  });

  it("should refuse every frame write from a reader of a public canvas and change nothing", async () => {
    const canvas = await teamPublicCanvas();
    const reader = await agentOf(outsider);
    const before = await row(canvas.id);
    // A base that would be current, had the reader been given one.
    const base = `start.${String(before.updatedAt.getTime())}`;
    for (const [name, args] of [
      ["canvas_frame_save", { frame: frame("defaced") }],
      ["canvas_frame_update", { frameId: "home", name: "Defaced" }],
      ["canvas_frame_delete", { frameId: "home" }],
    ] as const) {
      const result = await reader(name, { id: canvas.publicId, baseVersion: base, ...args });
      expect(result.isError, name).toBe(true);
      expect(result.text, name).toBe("Artifact not found, or you cannot edit it. You can edit your own artifacts and those shared through your team.");
    }
    const after = await row(canvas.id);
    expect(after.content).toBe(before.content);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it("should give someone who cannot read the canvas nothing: not a frame, not its name, not whether it exists", async () => {
    const canvas = await newCanvas();
    const stranger = await agentOf(outsider);
    for (const [name, args] of [
      ["canvas_frames_list", {}],
      ["canvas_frame_get", { frameId: "home" }],
    ] as const) {
      const result = await stranger(name, { id: canvas.publicId, ...args });
      expect(result.isError, name).toBe(true);
      expect(result.text, name).toBe("Artifact not found.");
    }
    const missing = await stranger("canvas_frames_list", { id: "aaaaaaaaaaaaaaaaaaaaaa" });
    expect(missing.text, "a private canvas reads the same as one that does not exist").toBe("Artifact not found.");
  });
});
