import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";

/*
 * artifacts_create and artifacts_update with `icon`, through the real MCP
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

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";

function dto(icon: string | null): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Plan", icon, theme: null, summary: "", content: "# Plan", kind: "markdown", language: "", project: null, sessionId: "", source: "",
    visibility: "private", comments: "team", teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z",
  };
}

let client: Client;

beforeEach(async () => {
  vi.resetAllMocks();
  data.getEditableArtifact.mockResolvedValue({ id: "internal-1", publicId });
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerArtifactTools(server, "agent-1", "full");
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

describe("artifacts_create with icon", () => {
  it("should save and return the icon when it is one emoji", async () => {
    data.createArtifact.mockResolvedValue(dto("🧪"));
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", icon: "🧪" });
    expect(result.isError).toBe(false);
    expect(data.createArtifact).toHaveBeenCalledWith("agent-1", expect.objectContaining({ icon: "🧪" }));
    expect((JSON.parse(result.text) as { artifact: { icon: string } }).artifact.icon).toBe("🧪");
  });

  it("should save an allowed Tabler id when it is in the list", async () => {
    data.createArtifact.mockResolvedValue(dto("tabler:rocket"));
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", icon: "tabler:rocket" });
    expect(result.isError).toBe(false);
    expect(data.createArtifact).toHaveBeenCalledWith("agent-1", expect.objectContaining({ icon: "tabler:rocket" }));
  });

  it.each(["rocket", "🚀🚀", "<svg onload=alert(1)>", "tabler:not-real", "\u0007"])("should refuse %j before anything is saved", async (icon) => {
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", icon });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/one emoji/);
    expect(data.createArtifact).not.toHaveBeenCalled();
  });
});

describe("artifacts_update with icon", () => {
  it("should change only the icon when no other field is sent", async () => {
    data.updateArtifact.mockResolvedValue(dto("tabler:bug"));
    const result = await call("artifacts_update", { id: publicId, icon: "tabler:bug" });
    expect(result.isError).toBe(false);
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", { icon: "tabler:bug" }, "agent");
    expect((JSON.parse(result.text) as { artifact: { icon: string } }).artifact.icon).toBe("tabler:bug");
  });

  it.each([null, ""])("should pass %j through as a removal when the agent clears the icon", async (icon) => {
    data.updateArtifact.mockResolvedValue(dto(null));
    const result = await call("artifacts_update", { id: publicId, icon });
    expect(result.isError).toBe(false);
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", { icon }, "agent");
  });

  it("should go through the agent update path so approval rules apply when the artifact is shared", async () => {
    data.updateArtifact.mockResolvedValue({ ...dto("🚀"), pendingEdit: { requestId: "r1", requestedAt: "2026-11-07T00:00:00.000Z" } });
    const result = await call("artifacts_update", { id: publicId, icon: "🚀" });
    expect((JSON.parse(result.text) as { edit: string }).edit).toBe("pending");
  });

  it("should pass an uploaded image id to the data layer, which checks the file, when it is a uuid", async () => {
    data.updateArtifact.mockResolvedValue(dto("file:0f8fad5b-d9cb-469f-a165-70867728950e"));
    const result = await call("artifacts_update", { id: publicId, icon: "file:0f8fad5b-d9cb-469f-a165-70867728950e" });
    expect(result.isError).toBe(false);
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", { icon: "file:0f8fad5b-d9cb-469f-a165-70867728950e" }, "agent");
  });

  it("should refuse a file icon that is not a uuid before anything is saved", async () => {
    const result = await call("artifacts_update", { id: publicId, icon: "file:../secret" });
    expect(result.isError).toBe(true);
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });

  it("should refuse text when it is not an emoji", async () => {
    const result = await call("artifacts_update", { id: publicId, icon: "launch" });
    expect(result.isError).toBe(true);
    expect(data.updateArtifact).not.toHaveBeenCalled();
  });
});

describe("tools/list", () => {
  it("should describe the icon field so an agent can act on it", async () => {
    const { tools } = await client.listTools();
    const update = tools.find((tool) => tool.name === "artifacts_update");
    const icon = (update?.inputSchema.properties as Record<string, { description?: string }> | undefined)?.icon;
    expect(icon?.description).toMatch(/tabler:<name>/);
    expect(icon?.description).toMatch(/null or "" removes/);
    expect(icon?.description).toMatch(/file:<file id>/);
    expect(icon?.description).toMatch(/SVG is not accepted/);
  });
});
