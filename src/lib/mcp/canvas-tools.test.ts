import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";
import { EditConflictError } from "@/lib/edits/conflict-error";
import type { McpAccess } from "@/lib/oauth/scopes";

/*
 * The canvas frame tools, through the real MCP server and client: what each
 * returns, that writes go through the one save with the agent's baseVersion,
 * and how refusals read. Storage is mocked at the data layer.
 */

const data = vi.hoisted(() => ({
  updateArtifact: vi.fn(),
  getEditableArtifact: vi.fn(),
  loadArtifactForViewer: vi.fn(),
  lastSavedBy: vi.fn(),
  frameImageStatesFor: vi.fn(),
  readFrameImage: vi.fn(),
}));
vi.mock("@/lib/canvas/capture-read", () => ({ frameImageStatesFor: data.frameImageStatesFor, readFrameImage: data.readFrameImage }));
vi.mock("@/lib/artifacts", () => ({ updateArtifact: data.updateArtifact }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: data.getEditableArtifact }));
vi.mock("@/lib/artifact-read", () => ({ loadArtifactForViewer: data.loadArtifactForViewer }));
vi.mock("@/lib/edits/agent-write-guard", () => ({ lastSavedBy: data.lastSavedBy }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));
vi.mock("@/lib/versions/history", () => ({ versionAt: () => Promise.resolve({ id: versionId }) }));

const versionId = "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f";
const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";
const savedAt = "2026-11-11T13:08:00.123Z";
const laterAt = "2026-11-11T13:15:00.000Z";
const tokenAt = (at: string) => `${versionId}.${String(Date.parse(at))}`;
const token = tokenAt(savedAt);

const heading = (text: string) => ({ version: 1, root: "page", elements: { page: { type: "Heading", props: { text } } } });
const frame = (id: string, overrides: Record<string, unknown> = {}) => ({ id, name: `Screen ${id}`, width: 390, spec: heading(id), ...overrides });
const board = (frames: readonly unknown[]) => JSON.stringify({ version: 1, frames });
const stored = board([frame("home"), frame("pricing")]);

const { registerCanvasTools } = await import("./canvas-tools");

function dto(content = stored, overrides: Partial<ArtifactDto> = {}): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Checkout flow", icon: null, theme: null, cover: null, fullWidth: false, sheetFormat: { banding: null, align: {} }, allowCsvDownload: false, summary: "", content, kind: "canvas", language: "", project: null, tags: [], sessionId: "", source: "",
    visibility: "private", comments: "team", showInSearch: false, teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null, harness: null,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-07T00:00:00.000Z", updatedAt: savedAt, ...overrides,
  };
}

const read = (canEdit: boolean, source: "latest" | "approved" = "latest", content = stored, editPending = false) => ({ dto: dto(content), viewable: { canEdit, version: { source }, editPending } });
const row = (content = stored, kind = "canvas") => ({ id: "internal-1", publicId, kind, content, updatedAt: new Date(savedAt) });
const idsOf = (content: string) => (JSON.parse(content) as { frames: { id: string }[] }).frames.map((item) => item.id);
/** The content the tool handed to the save. */
const savedContent = () => (data.updateArtifact.mock.calls[0]?.[2] as { content: string }).content;

let client: Client;

async function connect(access: McpAccess = "full") {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerCanvasTools(server, "agent-1", access, () => Promise.resolve({ harness: "claude-code", label: null }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
}

beforeEach(async () => {
  vi.resetAllMocks();
  data.getEditableArtifact.mockResolvedValue(row());
  data.lastSavedBy.mockResolvedValue({ handle: "charles", harness: null });
  await connect();
});

afterEach(async () => {
  await client.close();
});

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
  structuredContent?: { error?: { code: string; message: string; changedBy: unknown; nextStep: string } };
}

async function call(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = result.content[0]?.text ?? "";
  return { isError: result.isError === true, text, structured: result.structuredContent, json: () => JSON.parse(text) as Record<string, unknown> };
}

describe("canvas_frames_list", () => {
  it("should return every frame's outline, the totals, and the limits, with no spec, when the caller can read the canvas", async () => {
    data.loadArtifactForViewer.mockResolvedValue(read(true));
    const result = await call("canvas_frames_list", { id: publicId });
    expect(data.loadArtifactForViewer).toHaveBeenCalledWith(publicId, "agent-1");
    expect(result.json()).toEqual({
      id: publicId, title: "Checkout flow", url: `https://artifacts.space/artifact/${publicId}`, version: "latest", editPending: false,
      frames: [
        { id: "home", name: "Screen home", width: 390, height: null, padding: "md", position: { x: 0, y: 0, auto: true }, elements: 1, problems: 0 },
        { id: "pricing", name: "Screen pricing", width: 390, height: null, padding: "md", position: { x: 470, y: 0, auto: true }, elements: 1, problems: 0 },
      ],
      frameCount: 2, elements: 2, bytes: stored.length, limits: { frames: 24, elements: 3000, bytes: 800000 }, problems: [],
      versionId, baseVersion: token,
    });
    expect(result.text).not.toContain("Heading");
  });

  it("should leave out the baseVersion when the caller cannot edit the canvas or reads the approved version", async () => {
    data.loadArtifactForViewer.mockResolvedValue(read(false));
    expect((await call("canvas_frames_list", { id: publicId })).json()).not.toHaveProperty("baseVersion");
    data.loadArtifactForViewer.mockResolvedValue(read(true, "approved", stored, true));
    const approved = (await call("canvas_frames_list", { id: publicId })).json();
    expect(approved).toMatchObject({ version: "approved", editPending: true });
    expect(approved).not.toHaveProperty("baseVersion");
    expect(approved).not.toHaveProperty("versionId");
  });

  it("should say which modes of each drawn frame have a current image when the caller can edit the canvas", async () => {
    data.loadArtifactForViewer.mockResolvedValue(read(true));
    data.frameImageStatesFor.mockResolvedValue(new Map([["home", { light: "current", dark: "none" }]]));
    const listed = (await call("canvas_frames_list", { id: publicId })).json() as { frames: Record<string, unknown>[] };
    expect(data.frameImageStatesFor).toHaveBeenCalledWith("agent-1", publicId);
    expect(listed.frames[0]).toMatchObject({ id: "home", image: { light: "current", dark: "none" } });
    // A frame the board does not draw, or where images are off, has no `image` at all.
    expect(listed.frames[1]).not.toHaveProperty("image");
    const one = (await call("canvas_frame_get", { id: publicId, frameId: "home" })).json();
    expect(one).toMatchObject({ image: { light: "current", dark: "none" }, baseVersion: token });
    expect((await call("canvas_frame_get", { id: publicId, frameId: "pricing" })).json()).not.toHaveProperty("image");
  });

  it("should never ask for image states, and report none, when the caller cannot edit the canvas or reads the approved version", async () => {
    // Were the states read for a reader, this is what would leak.
    data.frameImageStatesFor.mockResolvedValue(new Map([["home", { light: "current", dark: "current" }]]));
    for (const reader of [read(false), read(true, "approved", stored, true), read(false, "approved")]) {
      data.loadArtifactForViewer.mockResolvedValue(reader);
      const listed = await call("canvas_frames_list", { id: publicId });
      expect(listed.text).not.toContain("image");
      expect((await call("canvas_frame_get", { id: publicId, frameId: "home" })).text).not.toContain('"image"');
    }
    expect(data.frameImageStatesFor).not.toHaveBeenCalled();
  });

  it("should still list the frames, without `image`, when the image states cannot be read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    data.loadArtifactForViewer.mockResolvedValue(read(true));
    data.frameImageStatesFor.mockRejectedValue(new TypeError("connection lost to db.internal"));
    const listed = await call("canvas_frames_list", { id: publicId });
    expect(listed.isError).toBe(false);
    expect(listed.json()).toMatchObject({ frameCount: 2, baseVersion: token });
    expect(listed.text).not.toContain('"image"');
    // The error's name only: never its message.
    expect(logged).toHaveBeenCalledWith("[mcp] Frame image states could not be read", "TypeError");
    logged.mockRestore();
  });

  it("should answer not found when the caller may not read the artifact", async () => {
    data.loadArtifactForViewer.mockResolvedValue(null);
    const result = await call("canvas_frames_list", { id: publicId });
    expect(result.isError).toBe(true);
    expect(result.text).toBe("Artifact not found.");
  });

  it("should refuse an artifact that is not a canvas and say which tools read it", async () => {
    data.loadArtifactForViewer.mockResolvedValue({ ...read(true), dto: dto("# Notes", { kind: "markdown" }) });
    const result = await call("canvas_frames_list", { id: publicId });
    expect(result.isError).toBe(true);
    expect(result.text).toBe("This artifact is markdown content, not a canvas, so it has no frames. Read it with artifacts_get and change it with artifacts_update.");
  });
});

describe("canvas_frame_get", () => {
  it("should return the one frame as written, with its place and the baseVersion", async () => {
    data.loadArtifactForViewer.mockResolvedValue(read(true));
    const result = (await call("canvas_frame_get", { id: publicId, frameId: "pricing" })).json();
    expect(result).toMatchObject({ id: publicId, version: "latest", frame: frame("pricing"), position: { x: 470, y: 0, auto: true }, elements: 1, problems: [], versionId, baseVersion: token });
    expect(JSON.stringify(result)).not.toContain("Screen home");
  });

  it("should name the frames the canvas has when no frame has that id", async () => {
    data.loadArtifactForViewer.mockResolvedValue(read(true));
    const result = await call("canvas_frame_get", { id: publicId, frameId: "checkout" });
    expect(result.isError).toBe(true);
    expect(result.text).toBe('No frame has the id "checkout". The frames are: "home", "pricing".');
  });
});

describe("canvas_frame_save", () => {
  it("should save the canvas with the new frame through the one save, as an agent, with the agent's baseVersion and harness", async () => {
    data.updateArtifact.mockImplementation((_user: string, _id: string, input: { content: string }) => Promise.resolve(dto(input.content, { updatedAt: laterAt })));
    const result = await call("canvas_frame_save", { id: publicId, frame: frame("checkout", { width: 1440 }), after: "home", baseVersion: token });
    expect(result.isError).toBe(false);
    expect(data.getEditableArtifact).toHaveBeenCalledWith("agent-1", { publicId });
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", { content: expect.any(String) as string }, "agent", { harness: { harness: "claude-code", label: null }, baseVersion: token });
    expect(idsOf(savedContent())).toEqual(["home", "checkout", "pricing"]);
    expect(result.json()).toEqual({
      id: publicId, frameId: "checkout", edit: "applied", added: true,
      frame: { id: "checkout", name: "Screen checkout", width: 1440, height: null, padding: "md", position: { x: 470, y: 0, auto: true }, elements: 1, problems: 0 },
      frameCount: 3, elements: 3, versionId, baseVersion: tokenAt(laterAt),
    });
  });

  it("should describe what its own save wrote, never a later read", async () => {
    data.updateArtifact.mockImplementation((_user: string, _id: string, input: { content: string }) => Promise.resolve(dto(input.content, { updatedAt: laterAt })));
    await call("canvas_frame_save", { id: publicId, frame: frame("checkout"), baseVersion: token });
    // The result comes from the save's own return value: nothing reads the artifact again after it.
    expect(data.getEditableArtifact).toHaveBeenCalledTimes(1);
    expect(data.loadArtifactForViewer).not.toHaveBeenCalled();
  });

  it("should say the change waits for approval when the save is pending", async () => {
    data.updateArtifact.mockImplementation((_user: string, _id: string, input: { content: string }) => Promise.resolve(dto(input.content, { updatedAt: laterAt, pendingEdit: { requestId: "request-1", requestedAt: laterAt } })));
    expect((await call("canvas_frame_save", { id: publicId, frame: frame("checkout"), baseVersion: token })).json()).toMatchObject({ edit: "pending", baseVersion: tokenAt(laterAt) });
  });

  it("should save nothing and hand back no baseVersion when the canvas already has exactly that frame", async () => {
    const result = await call("canvas_frame_save", { id: publicId, frame: frame("pricing"), baseVersion: token });
    expect(data.updateArtifact).not.toHaveBeenCalled();
    const body = result.json();
    expect(body).toMatchObject({ edit: "unchanged", added: false, frameId: "pricing", frameCount: 2 });
    expect(body).not.toHaveProperty("baseVersion");
    expect(body).not.toHaveProperty("versionId");
  });

  it("should refuse a frame that is not valid before saving, naming the frame, the element, and the fix", async () => {
    const bad = frame("checkout", { width: 10, spec: { version: 1, root: "page", elements: { page: { type: "Heading", props: { text: "Hi", level: 9 } } } } });
    const result = await call("canvas_frame_save", { id: publicId, frame: bad, baseVersion: token });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("The frame is not valid. Nothing was saved. Fix these and try again:");
    expect(result.text).toContain('- Error: Frame "checkout": "width" must be a whole number from 240 to 2560');
    expect(result.text).toMatch(/- Error: Frame "checkout": .*page/);
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });

  it("should refuse an artifact that is not a canvas", async () => {
    data.getEditableArtifact.mockResolvedValue(row("# Notes", "markdown"));
    const result = await call("canvas_frame_save", { id: publicId, frame: frame("checkout"), baseVersion: token });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/^This artifact is markdown content, not a canvas/);
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });

  it("should answer not found, and save nothing, when the caller may not edit the artifact", async () => {
    data.getEditableArtifact.mockResolvedValue(null);
    const result = await call("canvas_frame_save", { id: publicId, frame: frame("checkout"), baseVersion: token });
    expect(result.isError).toBe(true);
    expect(result.text).toBe("Artifact not found, or you cannot edit it. You can edit your own artifacts and those shared through your team.");
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });
});

describe("frame writes and concurrent edits", () => {
  it("should refuse a write that sends no baseVersion and say where to get one", async () => {
    const result = await call("canvas_frame_save", { id: publicId, frame: frame("checkout") });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Pass baseVersion.");
    expect(result.text).toContain("canvas_frames_list");
    expect(data.getEditableArtifact).not.toHaveBeenCalled();
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });

  it("should refuse with a typed error that names who saved, and save nothing, when the canvas changed since the agent read it", async () => {
    const result = await call("canvas_frame_save", { id: publicId, frame: frame("checkout"), baseVersion: tokenAt("2026-11-11T13:00:00.000Z") });
    expect(result.isError).toBe(true);
    expect(result.text).toBe("This canvas changed since you read it (by @charles via the web). Nothing was saved. Call canvas_frames_list for its frames as they are now and the new baseVersion (canvas_frame_get for one frame in full), apply your change to that, and save with the new baseVersion.");
    expect(result.structured?.error).toEqual({ code: "artifact_changed", message: result.text, changedBy: { handle: "charles", via: "web" }, nextStep: "canvas_frames_list" });
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });

  it("should return the same typed error when the save itself is refused, because someone saved between the read and the write", async () => {
    data.updateArtifact.mockRejectedValue(new EditConflictError("changed", { handle: "ann", harness: { id: "claude-code", name: "Claude Code" } }));
    const result = await call("canvas_frame_update", { id: publicId, frameId: "home", name: "Home, new", baseVersion: token });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("This canvas changed since you read it (by @ann via Claude Code). Nothing was saved.");
    expect(result.structured?.error).toMatchObject({ code: "artifact_changed", changedBy: { handle: "ann", via: "Claude Code" }, nextStep: "canvas_frames_list" });
  });

  it("should pass on the usual typed refusal when a person is typing in the canvas", async () => {
    data.updateArtifact.mockRejectedValue(new EditConflictError("editing", { handle: "charles", harness: null }));
    const result = await call("canvas_frame_delete", { id: publicId, frameId: "home", baseVersion: token });
    expect(result.isError).toBe(true);
    expect(result.structured?.error).toMatchObject({ code: "artifact_being_edited", nextStep: "artifacts_get" });
    expect(result.text).toBe(result.structured?.error?.message);
  });

  it("should refuse a baseVersion the server never handed out", async () => {
    const result = await call("canvas_frame_delete", { id: publicId, frameId: "home", baseVersion: "latest" });
    expect(result.isError).toBe(true);
    expect(result.text).toBe("baseVersion is not one artifacts.space handed out. Call canvas_frames_list and pass its baseVersion exactly as you got it.");
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });

  it("should check the base before it looks for the frame, so a stale agent is told to read again, not that its frame is gone", async () => {
    const result = await call("canvas_frame_update", { id: publicId, frameId: "deleted-by-someone", name: "x", baseVersion: tokenAt("2026-11-11T13:00:00.000Z") });
    expect(result.structured?.error?.code).toBe("artifact_changed");
  });
});

describe("canvas_frame_update", () => {
  beforeEach(() => {
    data.updateArtifact.mockImplementation((_user: string, _id: string, input: { content: string }) => Promise.resolve(dto(input.content, { updatedAt: laterAt })));
  });

  it("should change only the fields given and leave the spec as written", async () => {
    const result = await call("canvas_frame_update", { id: publicId, frameId: "pricing", name: "Pricing, desktop", width: 1440, height: 900, padding: "none", baseVersion: token });
    const frames = (JSON.parse(savedContent()) as { frames: Record<string, unknown>[] }).frames;
    expect(frames[1]).toEqual({ id: "pricing", name: "Pricing, desktop", width: 1440, spec: heading("pricing"), height: 900, padding: "none" });
    expect(frames[0]).toEqual(frame("home"));
    expect(result.json()).toMatchObject({ frameId: "pricing", edit: "applied", frame: { name: "Pricing, desktop", width: 1440, height: 900, padding: "none" }, baseVersion: tokenAt(laterAt) });
    expect(result.json()).not.toHaveProperty("added");
  });

  it("should move the frame in the order, and remove an optional field sent as null", async () => {
    data.getEditableArtifact.mockResolvedValue(row(board([frame("home", { height: 900 }), frame("pricing")])));
    await call("canvas_frame_update", { id: publicId, frameId: "home", height: null, after: "pricing", baseVersion: token });
    expect(idsOf(savedContent())).toEqual(["pricing", "home"]);
    expect((JSON.parse(savedContent()) as { frames: unknown[] }).frames[1]).toEqual(frame("home"));
  });

  it("should refuse values a frame cannot have, with the same message as validation, and save nothing", async () => {
    const result = await call("canvas_frame_update", { id: publicId, frameId: "pricing", width: 99_999, baseVersion: token });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Frame "pricing": "width" must be a whole number from 240 to 2560');
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });
});

describe("canvas_frame_delete", () => {
  it("should save the canvas without the frame and confirm the delete with the new baseVersion", async () => {
    data.updateArtifact.mockImplementation((_user: string, _id: string, input: { content: string }) => Promise.resolve(dto(input.content, { updatedAt: laterAt })));
    const result = await call("canvas_frame_delete", { id: publicId, frameId: "home", baseVersion: token });
    expect(idsOf(savedContent())).toEqual(["pricing"]);
    expect(result.json()).toEqual({ id: publicId, frameId: "home", edit: "applied", deleted: true, frameCount: 1, elements: 1, versionId, baseVersion: tokenAt(laterAt) });
  });

  it("should name the frames the canvas has, and save nothing, when no frame has that id", async () => {
    const result = await call("canvas_frame_delete", { id: publicId, frameId: "checkout", baseVersion: token });
    expect(result.isError).toBe(true);
    expect(result.text).toBe('No frame has the id "checkout". The frames are: "home", "pricing".');
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });
});

describe("read-only connections", () => {
  it("should list only the three read tools, and refuse a frame write as an unknown tool", async () => {
    await client.close();
    await connect("read");
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["canvas_frame_get", "canvas_frame_image", "canvas_frames_list"]);
    const result = await call("canvas_frame_save", { id: publicId, frame: frame("checkout"), baseVersion: token });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/not found/);
    expect(data.getEditableArtifact).not.toHaveBeenCalled();
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });
});
