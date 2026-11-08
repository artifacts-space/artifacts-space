import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";

/*
 * artifacts_create and artifacts_update with `cover` and `coverPosition`, and the
 * cover gradients in themes_list, through the real MCP
 * server and client over an in-memory transport: the same input validation
 * and handler an agent reaches. Storage is mocked at the data layer.
 */

const data = vi.hoisted(() => ({
  createArtifact: vi.fn(),
  updateArtifact: vi.fn(),
  deleteArtifact: vi.fn(),
  getOwnArtifactByPublicId: vi.fn(),
  listArtifacts: vi.fn(),
  getEditableArtifact: vi.fn(),
  loadArtifactForViewer: vi.fn(),
}));
vi.mock("@/lib/artifacts", () => ({
  createArtifact: data.createArtifact,
  updateArtifact: data.updateArtifact,
  deleteArtifact: data.deleteArtifact,
  getOwnArtifactByPublicId: data.getOwnArtifactByPublicId,
  listArtifacts: data.listArtifacts,
}));
vi.mock("@/lib/access", () => ({ getEditableArtifact: data.getEditableArtifact }));
vi.mock("@/lib/artifact-read", () => ({ loadArtifactForViewer: data.loadArtifactForViewer }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: () => Promise.resolve([]) }));
vi.mock("@/lib/sharing/comments", () => ({ setArtifactComments: vi.fn() }));
vi.mock("@/lib/sharing/service", () => ({ requestArtifactSharing: vi.fn() }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));

const { registerArtifactTools } = await import("./artifact-tools");
const { registerThemeTools } = await import("./theme-tools");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";

function dto(cover: ArtifactDto["cover"]): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Plan", icon: null, theme: null, cover, summary: "", content: "# Plan", kind: "markdown", language: "", project: null, tags: [], sessionId: "", source: "",
    visibility: "private", comments: "team", teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z",
  };
}

let client: Client;

beforeEach(async () => {
  vi.resetAllMocks();
  data.getEditableArtifact.mockResolvedValue({ id: "internal-1", publicId, cover: null });
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerArtifactTools(server, "agent-1", "full");
  registerThemeTools(server, "full");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

interface ToolText {
  isError?: boolean;
  content: { type: string; text: string }[];
}

async function call(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as ToolText;
  const text = result.content[0]?.text ?? "";
  return { isError: result.isError === true, text };
}

const fileId = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("artifacts_create with cover", () => {
  it("should pass a gradient id to the data layer and return it when the gradient exists", async () => {
    data.createArtifact.mockResolvedValue(dto("mist"));
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", cover: "mist" });
    expect(result.isError).toBe(false);
    expect(data.createArtifact).toHaveBeenCalledWith("agent-1", expect.objectContaining({ cover: "mist" }));
    expect(JSON.parse(result.text)).toMatchObject({ artifact: { cover: "mist", coverPosition: null } });
  });

  it("should store an image cover with its focal point and return them apart", async () => {
    data.createArtifact.mockResolvedValue(dto(`file:${fileId}@20`));
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", cover: `file:${fileId}`, coverPosition: 20 });
    expect(result.isError).toBe(false);
    expect(data.createArtifact).toHaveBeenCalledWith("agent-1", expect.objectContaining({ cover: `file:${fileId}@20` }));
    expect(JSON.parse(result.text)).toMatchObject({ artifact: { cover: `file:${fileId}`, coverPosition: 20 } });
  });

  it.each(["neon", "https://example.com/cover.png", "file:../../etc/passwd"])("should refuse %j with the allowed values before anything is saved", async (cover) => {
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", cover });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/gradient id/);
    expect(result.text).toContain("mist");
    expect(data.createArtifact).not.toHaveBeenCalled();
  });

  it("should refuse a focal point without an image cover before anything is saved", async () => {
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", cover: "mist", coverPosition: 30 });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/coverPosition only applies to an image cover/);
    expect(data.createArtifact).not.toHaveBeenCalled();
  });

  it("should refuse a focal point outside 0 to 100", async () => {
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", cover: `file:${fileId}`, coverPosition: 150 });
    expect(result.isError).toBe(true);
    expect(data.createArtifact).not.toHaveBeenCalled();
  });
});

describe("artifacts_update with cover", () => {
  it("should change only the cover through the agent update path when no other field is sent", async () => {
    data.updateArtifact.mockResolvedValue(dto("dusk"));
    const result = await call("artifacts_update", { id: publicId, cover: "dusk" });
    expect(result.isError).toBe(false);
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", { cover: "dusk" }, "agent");
  });

  it.each([null, ""])("should remove the cover when the agent sends %j", async (cover) => {
    data.updateArtifact.mockResolvedValue(dto(null));
    const result = await call("artifacts_update", { id: publicId, cover });
    expect(result.isError).toBe(false);
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", { cover: null }, "agent");
  });

  it("should move the current image cover when only coverPosition is sent", async () => {
    data.getEditableArtifact.mockResolvedValue({ id: "internal-1", publicId, cover: `file:${fileId}` });
    data.updateArtifact.mockResolvedValue(dto(`file:${fileId}@75`));
    const result = await call("artifacts_update", { id: publicId, coverPosition: 75 });
    expect(result.isError).toBe(false);
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", { cover: `file:${fileId}@75` }, "agent");
  });

  it("should refuse coverPosition alone when the artifact has a gradient cover", async () => {
    data.getEditableArtifact.mockResolvedValue({ id: "internal-1", publicId, cover: "mist" });
    const result = await call("artifacts_update", { id: publicId, coverPosition: 75 });
    expect(result.isError).toBe(true);
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });

  it("should report a pending edit when a cover change on a shared artifact waits for approval", async () => {
    data.updateArtifact.mockResolvedValue({ ...dto("bloom"), pendingEdit: { requestId: "r1", requestedAt: "2026-11-07T00:00:00.000Z" } });
    const result = await call("artifacts_update", { id: publicId, cover: "bloom" });
    expect((JSON.parse(result.text) as { edit: string }).edit).toBe("pending");
  });

  it("should refuse a cover on an artifact the agent cannot edit before anything is saved", async () => {
    data.getEditableArtifact.mockResolvedValue(null);
    const result = await call("artifacts_update", { id: publicId, cover: "mist" });
    expect(result.isError).toBe(true);
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });
});

describe("cover gradients in themes_list", () => {
  it("should list every gradient with its id and name, and how to use them", async () => {
    const result = await call("themes_list", {});
    const parsed = JSON.parse(result.text) as { covers: { gradients: { id: string; name: string }[]; usage: string } };
    expect(parsed.covers.gradients.map((gradient) => gradient.id)).toEqual(expect.arrayContaining(["stone", "mist", "dusk"]));
    expect(parsed.covers.usage).toMatch(/file:<file id>/);
  });

  it("should describe cover and coverPosition on create and update so an agent can act on them", async () => {
    const { tools } = await client.listTools();
    for (const name of ["artifacts_create", "artifacts_update"]) {
      const properties = tools.find((tool) => tool.name === name)?.inputSchema.properties as Record<string, { description?: string }> | undefined;
      expect(properties?.cover?.description).toMatch(/gradient id .*mist/);
      expect(properties?.cover?.description).toMatch(/SVG and remote URLs are not accepted/);
      expect(properties?.coverPosition?.description).toMatch(/focal point/);
    }
  });
});
