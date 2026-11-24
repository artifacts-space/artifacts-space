import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";

/*
 * Whether artifacts_create and artifacts_update send the saved content back
 * (`returnContent`), and `contentAdjusted` when the save stored other text,
 * through the real MCP server and client over an in-memory transport.
 * Storage is mocked at the data layer.
 */

const data = vi.hoisted(() => ({
  createArtifact: vi.fn(),
  updateArtifact: vi.fn(),
  getEditableArtifact: vi.fn(),
}));
vi.mock("@/lib/mcp/actors", async (importOriginal) => ({ ...(await importOriginal<object>()), loadMcpActors: () => Promise.resolve(new Map()) }));
vi.mock("@/lib/artifacts", () => ({
  createArtifact: data.createArtifact,
  updateArtifact: data.updateArtifact,
  getEditableArtifactDto: vi.fn(),
  deleteArtifact: vi.fn(),
  getOwnArtifactByPublicId: vi.fn(),
  listArtifacts: vi.fn(),
}));
vi.mock("@/lib/access", () => ({ getEditableArtifact: data.getEditableArtifact }));
vi.mock("@/lib/artifact-read", () => ({ loadArtifactForViewer: vi.fn() }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: () => Promise.resolve([]) }));
vi.mock("@/lib/sharing/comments", () => ({ setArtifactComments: vi.fn() }));
vi.mock("@/lib/sharing/service", () => ({ requestArtifactSharing: vi.fn() }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));
vi.mock("@/lib/versions/history", () => ({ latestVersion: () => Promise.resolve({ id: "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f" }), versionAt: () => Promise.resolve({ id: "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f" }) }));
const { registerArtifactTools } = await import("./artifact-tools");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";
const page = "<!doctype html><html><body><h1>Launch</h1></body></html>";

function dto(content: string): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Launch", icon: null, theme: null, cover: null, fullWidth: false, sheetFormat: { banding: null, align: {} }, allowCsvDownload: false, summary: "", content, kind: "html", language: "", project: null, tags: [], sessionId: "", source: "",
    visibility: "private", comments: "team", showInSearch: false, teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null, harness: null,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-24T00:00:00.000Z", updatedAt: "2026-11-24T00:00:00.000Z",
  };
}

let client: Client;

beforeEach(async () => {
  vi.resetAllMocks();
  data.getEditableArtifact.mockResolvedValue({ id: "internal-1", publicId, cover: null });
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerArtifactTools(server, "agent-1", "full");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

async function artifactFrom(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  expect(result.isError).not.toBe(true);
  const parsed = JSON.parse(result.content[0]?.text ?? "{}") as { artifact: Record<string, unknown> };
  return parsed.artifact;
}

describe("artifacts_create result", () => {
  it("should leave the content out and keep the id, link, and baseVersion when returnContent is not sent", async () => {
    data.createArtifact.mockResolvedValue(dto(page));
    const artifact = await artifactFrom("artifacts_create", { title: "Launch", kind: "html", content: page });
    expect(artifact).not.toHaveProperty("content");
    expect(artifact).not.toHaveProperty("contentAdjusted");
    expect(artifact).toMatchObject({ id: publicId, url: `https://artifacts.space/artifact/${publicId}` });
    expect(typeof artifact.versionId).toBe("string");
    expect(typeof artifact.baseVersion).toBe("string");
  });

  it("should return the saved content when returnContent is true", async () => {
    data.createArtifact.mockResolvedValue(dto(page));
    const artifact = await artifactFrom("artifacts_create", { title: "Launch", kind: "html", content: page, returnContent: true });
    expect(artifact.content).toBe(page);
  });

  it("should say the content was adjusted when the save stored other text than was sent", async () => {
    data.createArtifact.mockResolvedValue(dto("[spec](/api/files/abc)"));
    const artifact = await artifactFrom("artifacts_create", { title: "Launch", content: "[spec](https://artifacts.space/api/files/abc)" });
    expect(artifact).not.toHaveProperty("content");
    expect(String(artifact.contentAdjusted)).toContain("artifacts_get");
  });

  it("should give the content and say it was adjusted when returnContent is true and the save stored other text", async () => {
    data.createArtifact.mockResolvedValue(dto("[spec](/api/files/abc)"));
    const artifact = await artifactFrom("artifacts_create", { title: "Launch", content: "[spec](https://artifacts.space/api/files/abc)", returnContent: true });
    expect(artifact.content).toBe("[spec](/api/files/abc)");
    expect(String(artifact.contentAdjusted)).toContain("artifacts_get");
  });
});

describe("artifacts_update result", () => {
  it("should leave the content out when the update sent new content", async () => {
    data.updateArtifact.mockResolvedValue(dto(page));
    const artifact = await artifactFrom("artifacts_update", { id: publicId, content: page });
    expect(artifact).not.toHaveProperty("content");
    expect(artifact).not.toHaveProperty("contentAdjusted");
    expect(artifact.id).toBe(publicId);
    expect(typeof artifact.baseVersion).toBe("string");
  });

  it("should leave the content out without calling it adjusted when the update sent no content", async () => {
    data.updateArtifact.mockResolvedValue(dto(page));
    const artifact = await artifactFrom("artifacts_update", { id: publicId, title: "Launch day" });
    expect(artifact).not.toHaveProperty("content");
    expect(artifact).not.toHaveProperty("contentAdjusted");
  });

  it("should return the saved content when returnContent is true", async () => {
    data.updateArtifact.mockResolvedValue(dto(page));
    const artifact = await artifactFrom("artifacts_update", { id: publicId, title: "Launch day", returnContent: true });
    expect(artifact.content).toBe(page);
  });
});
