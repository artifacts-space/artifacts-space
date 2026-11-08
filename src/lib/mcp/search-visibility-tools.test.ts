import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto, ArtifactProjectDto } from "@/lib/artifact-types";

/*
 * Agents cannot put an artifact in search engines: no MCP tool takes the
 * setting, and a write that sneaks it in never reaches storage. Agents can
 * read it on artifacts_get. Through the real MCP server and client over an
 * in-memory transport; storage is mocked at the data layer.
 */

const data = vi.hoisted(() => ({
  createArtifact: vi.fn(),
  updateArtifact: vi.fn(),
  getEditableArtifactDto: vi.fn(),
  listArtifacts: vi.fn(),
  getEditableArtifact: vi.fn(),
  setArtifactProject: vi.fn(),
  setArtifactTags: vi.fn(),
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
vi.mock("@/lib/projects/store", () => ({ setArtifactProject: data.setArtifactProject }));
vi.mock("@/lib/tags/store", () => ({ setArtifactTags: data.setArtifactTags }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: () => Promise.resolve([]) }));
vi.mock("@/lib/sharing/comments", () => ({ setArtifactComments: vi.fn() }));
vi.mock("@/lib/sharing/service", () => ({ requestArtifactSharing: vi.fn() }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));

const { registerArtifactTools } = await import("./artifact-tools");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";

function dto(project: ArtifactProjectDto | null, tags: string[] = [], showInSearch = false): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Plan", icon: null, theme: null, cover: null, summary: "", content: "# Plan", kind: "markdown", language: "", project, tags, sessionId: "", source: "",
    visibility: "public", comments: "team", showInSearch, teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null,
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

async function call(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  return { isError: result.isError === true, text: result.content[0]?.text ?? "" };
}

const searchWords = /search|index|seo|robots/i;

describe("search engines over MCP", () => {
  it("should offer no tool input that changes search engine visibility when an agent lists tools", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const properties = Object.keys(tool.inputSchema.properties ?? {});
      expect(properties.filter((name) => searchWords.test(name)), tool.name).toEqual([]);
    }
  });

  it("should never pass the setting to storage when an agent sends it on create or update", async () => {
    data.createArtifact.mockResolvedValue(dto(null));
    data.updateArtifact.mockResolvedValue(dto(null));
    const created = await call("artifacts_create", { title: "Plan", content: "# Plan", showInSearch: true });
    const updated = await call("artifacts_update", { id: publicId, title: "Plan", showInSearch: true });
    // Either the tool ignores the extra field or refuses the call; storage never sees it.
    for (const [result, mock] of [[created, data.createArtifact], [updated, data.updateArtifact]] as const) {
      if (!result.isError) expect(mock).toHaveBeenCalled();
      for (const args of mock.mock.calls) expect(JSON.stringify(args)).not.toContain("showInSearch");
    }
  });

  it("should report the setting read-only when an agent reads an artifact", async () => {
    data.loadArtifactForViewer.mockResolvedValue({ dto: dto(null, [], true), viewable: { version: { source: "latest" }, editPending: false } });
    const result = await call("artifacts_get", { id: publicId });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({ visibility: "public", showInSearch: true });
  });
});
