import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";

/*
 * The artifact a file tool hands back (artifactResult): its files and the
 * baseVersion of the save, never the content, which a file change does not
 * touch. files_attach through the real MCP server and client; storage is
 * mocked at the data layer.
 */

const data = vi.hoisted(() => ({ getEditableArtifact: vi.fn(), attachFiles: vi.fn(), toArtifactDtos: vi.fn() }));
vi.mock("@/lib/mcp/actors", async (importOriginal) => ({ ...(await importOriginal<object>()), loadMcpActors: () => Promise.resolve(new Map()) }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: data.getEditableArtifact }));
vi.mock("@/lib/files/attach", () => ({ assertUsableFiles: vi.fn(), attachFiles: data.attachFiles, deleteOwnFile: vi.fn() }));
vi.mock("@/lib/artifacts", () => ({ createArtifact: vi.fn(), getOwnArtifactByPublicId: vi.fn(), toArtifactDtos: data.toArtifactDtos }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: () => Promise.resolve([]) }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));
vi.mock("@/lib/versions/history", () => ({ getVersionOf: vi.fn(), latestVersion: () => Promise.resolve({ id: "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f" }), versionAt: () => Promise.resolve({ id: "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f" }) }));

const { registerFileTools } = await import("./file-tools");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";
const page = "<!doctype html><html><body><h1>Launch</h1></body></html>";
const record = { id: "internal-1", publicId, updatedAt: new Date("2026-11-24T00:00:00.000Z") };
const file = { id: "0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f", filename: "site.css", contentType: "text/css", size: 12, createdAt: "2026-11-24T00:00:00.000Z", replacedAt: null, pagePath: "css/site.css" };

function dto(): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Launch", icon: null, theme: null, cover: null, fullWidth: false, sheetFormat: { banding: null, align: {} }, allowCsvDownload: false, summary: "", content: page, kind: "html", language: "", project: null, tags: [], sessionId: "", source: "",
    visibility: "private", comments: "team", showInSearch: false, teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null, harness: null,
    files: [file], updatedBy: null, metadata: {}, createdAt: "2026-11-24T00:00:00.000Z", updatedAt: "2026-11-24T00:00:00.000Z",
  };
}

let client: Client;

beforeEach(async () => {
  vi.resetAllMocks();
  data.getEditableArtifact.mockResolvedValue(record);
  data.attachFiles.mockResolvedValue(record);
  data.toArtifactDtos.mockResolvedValue([dto()]);
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerFileTools(server, "agent-1", "full");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

describe("a file tool's artifact result", () => {
  it("should list the files and the baseVersion without the content when files_attach saves", async () => {
    const result = (await client.callTool({ name: "files_attach", arguments: { artifact: publicId, files: [file.id] } })) as { isError?: boolean; content: { text: string }[] };
    expect(result.isError).not.toBe(true);
    const artifact = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
    expect(artifact).not.toHaveProperty("content");
    expect(artifact).not.toHaveProperty("contentAdjusted");
    expect(artifact).toMatchObject({ id: publicId, files: [{ id: file.id, pagePath: "css/site.css" }] });
    expect(typeof artifact.baseVersion).toBe("string");
  });
});
