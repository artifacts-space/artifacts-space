import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto, ArtifactHarnessDto } from "@/lib/artifact-types";
import type { HarnessStamp } from "@/lib/harness/harness-rules";

import type { HarnessSource } from "./harness-context";

/*
 * The agent harness over MCP: creates and updates stamp the connection's
 * harness, reads return it read-only, and agents cannot set it. Real MCP
 * server and client over an in-memory transport; storage mocked.
 */

const data = vi.hoisted(() => ({
  createArtifact: vi.fn(),
  updateArtifact: vi.fn(),
  getEditableArtifactDto: vi.fn(),
  listArtifacts: vi.fn(),
  getEditableArtifact: vi.fn(),
  loadArtifactForViewer: vi.fn(),
}));
vi.mock("@/lib/artifacts", () => ({
  createArtifact: data.createArtifact,
  updateArtifact: data.updateArtifact,
  getEditableArtifactDto: data.getEditableArtifactDto,
  deleteArtifact: vi.fn(),
  getOwnArtifactByPublicId: vi.fn(),
  listArtifacts: data.listArtifacts,
}));
vi.mock("@/lib/access", () => ({ getEditableArtifact: data.getEditableArtifact }));
vi.mock("@/lib/artifact-read", () => ({ loadArtifactForViewer: data.loadArtifactForViewer }));
vi.mock("@/lib/page-width/store", () => ({ setArtifactFullWidth: vi.fn() }));
vi.mock("@/lib/projects/store", () => ({ setArtifactProject: vi.fn() }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: () => Promise.resolve([]) }));
vi.mock("@/lib/sharing/comments", () => ({ setArtifactComments: vi.fn() }));
vi.mock("@/lib/sharing/service", () => ({ requestArtifactSharing: vi.fn() }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));

const { registerArtifactTools } = await import("./artifact-tools");
const { memoHarness } = await import("./harness-context");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";
const codex: HarnessStamp = { harness: "codex", label: null };

function dto(harness: ArtifactHarnessDto | null): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Plan", icon: null, theme: null, cover: null, fullWidth: false, summary: "", content: "# Plan", kind: "markdown", language: "", project: null, tags: [], sessionId: "", source: "",
    visibility: "private", comments: "team", showInSearch: false, teamId: null, authorId: "user-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null, harness,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-08T00:00:00.000Z", updatedAt: "2026-11-08T00:00:00.000Z",
  };
}

let client: Client;
let lookups: number;

async function connect(harness: HarnessSource) {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerArtifactTools(server, "user-1", "full", harness);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
}

beforeEach(async () => {
  vi.resetAllMocks();
  lookups = 0;
  data.getEditableArtifact.mockResolvedValue({ id: "internal-1", publicId, cover: null });
  data.createArtifact.mockResolvedValue(dto({ id: "codex", stamped: "codex", overridden: false }));
  data.updateArtifact.mockResolvedValue(dto({ id: "codex", stamped: "codex", overridden: false }));
  await connect(memoHarness(() => {
    lookups += 1;
    return Promise.resolve(codex);
  }));
});

afterEach(async () => {
  await client.close();
});

async function call(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  return { isError: result.isError === true, json: JSON.parse(result.content[0]?.text ?? "null") as Record<string, unknown> };
}

describe("stamping the harness over MCP", () => {
  it("should stamp the connection's harness when an agent creates an artifact", async () => {
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan" });
    expect(result.isError).toBe(false);
    expect(data.createArtifact).toHaveBeenCalledWith("user-1", expect.objectContaining({ title: "Plan" }), { harness: codex });
    expect(result.json.artifact).toMatchObject({ harness: { id: "codex", name: "Codex" } });
  });

  it("should stamp the connection's harness when an agent updates an artifact", async () => {
    await call("artifacts_update", { id: publicId, content: "# Plan v2" });
    expect(data.updateArtifact).toHaveBeenCalledWith("user-1", "internal-1", expect.objectContaining({ content: "# Plan v2" }), "agent", { harness: codex });
  });

  it("should never pass an agent's own harness value to storage when it tries to set one", async () => {
    await call("artifacts_update", { id: publicId, content: "# Plan v3", harness: "cursor", harnessOverride: "cursor" });
    const input = data.updateArtifact.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(input).not.toHaveProperty("harness");
    expect(input).not.toHaveProperty("harnessOverride");
  });

  it("should not look the harness up when an update changes no content", async () => {
    data.getEditableArtifactDto.mockResolvedValue(dto(null));
    await call("artifacts_update", { id: publicId, fullWidth: undefined });
    expect(data.updateArtifact).not.toHaveBeenCalled();
    expect(lookups).toBe(0);
  });

  it("should still save without a harness when the lookup fails", async () => {
    await client.close();
    await connect(memoHarness(() => Promise.reject(new Error("db down"))));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan" });
    expect(result.isError).toBe(false);
    expect(data.createArtifact).toHaveBeenCalledWith("user-1", expect.anything(), { harness: null });
  });
});

describe("reading the harness over MCP", () => {
  it("should return the harness read-only when an agent gets an artifact", async () => {
    data.loadArtifactForViewer.mockResolvedValue({ dto: dto({ id: "cursor", stamped: "codex", overridden: true }), viewable: { version: { source: "latest" }, editPending: false } });
    const result = await call("artifacts_get", { id: publicId });
    expect(result.json.harness).toEqual({ id: "cursor", name: "Cursor" });
  });

  it("should return the harness in lists and null when no agent made it", async () => {
    data.listArtifacts.mockResolvedValue([{ ...dto({ id: "claude-code", stamped: "claude-code", overridden: false }), preview: "" }, { ...dto(null), preview: "" }]);
    const result = (await client.callTool({ name: "artifacts_list", arguments: {} })) as { content: { text: string }[] };
    const items = JSON.parse(result.content[0]?.text ?? "[]") as { harness: unknown }[];
    expect(items.map((item) => item.harness)).toEqual([{ id: "claude-code", name: "Claude Code" }, null]);
  });

  it("should not offer a harness field on the write tools", async () => {
    const { tools } = await client.listTools();
    for (const name of ["artifacts_create", "artifacts_update"]) {
      const schema = tools.find((tool) => tool.name === name)?.inputSchema as { properties: Record<string, unknown> } | undefined;
      expect(Object.keys(schema?.properties ?? {})).not.toContain("harness");
    }
  });
});
