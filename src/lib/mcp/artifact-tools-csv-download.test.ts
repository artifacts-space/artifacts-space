import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";

/*
 * "Allow CSV download" over MCP, through the real MCP server and client
 * over an in-memory transport: a connection that cannot edit a CSV whose
 * owner turned downloads off gets it without its content, and no agent can
 * turn the setting on. Storage is mocked at the data layer.
 */

const data = vi.hoisted(() => ({
  updateArtifact: vi.fn(),
  getEditableArtifactDto: vi.fn(),
  listArtifacts: vi.fn(),
  getEditableArtifact: vi.fn(),
  loadArtifactForViewer: vi.fn(),
  setArtifactFullWidth: vi.fn(),
  setCsvDownload: vi.fn(),
}));
vi.mock("@/lib/artifacts", () => ({
  createArtifact: vi.fn(),
  updateArtifact: data.updateArtifact,
  getEditableArtifactDto: data.getEditableArtifactDto,
  deleteArtifact: vi.fn(),
  getOwnArtifactByPublicId: vi.fn(),
  listArtifacts: data.listArtifacts,
}));
vi.mock("@/lib/access", () => ({ getEditableArtifact: data.getEditableArtifact }));
vi.mock("@/lib/artifact-read", () => ({ loadArtifactForViewer: data.loadArtifactForViewer }));
vi.mock("@/lib/page-width/store", () => ({ setArtifactFullWidth: data.setArtifactFullWidth }));
vi.mock("@/lib/csv-export/store", () => ({ setCsvDownload: data.setCsvDownload }));
vi.mock("@/lib/projects/store", () => ({ setArtifactProject: vi.fn() }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: () => Promise.resolve([]) }));
vi.mock("@/lib/sharing/comments", () => ({ setArtifactComments: vi.fn() }));
vi.mock("@/lib/sharing/service", () => ({ requestArtifactSharing: vi.fn() }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));

vi.mock("@/lib/versions/history", () => ({ latestVersion: () => Promise.resolve({ id: "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f" }), versionAt: () => Promise.resolve({ id: "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f" }) }));
const { registerArtifactTools } = await import("./artifact-tools");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";

const rows = "name,secret\nalpha,s3cr3t-row\n";

function dto(allowCsvDownload: boolean): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Sheet", icon: null, theme: null, cover: null, fullWidth: true, sheetFormat: { banding: null, align: {} }, allowCsvDownload, summary: "", content: rows, kind: "csv", language: "", project: null, tags: [], sessionId: "", source: "",
    visibility: "private", comments: "team", showInSearch: false, teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null, harness: null,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z",
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

async function call(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  return { isError: result.isError === true, text: result.content[0]?.text ?? "" };
}

const read = (canEdit: boolean, allowCsvDownload = false) => ({ dto: dto(allowCsvDownload), viewable: { canEdit, version: { source: "latest" }, editPending: false } });

describe("artifacts_get on a CSV whose owner turned downloads off", () => {
  it("should leave the rows out for a non-member's connection and say why", async () => {
    data.loadArtifactForViewer.mockResolvedValue(read(false));
    const result = await call("artifacts_get", { id: publicId });
    expect(result.isError).toBe(false);
    expect(result.text).not.toContain("s3cr3t-row");
    expect(JSON.parse(result.text)).toMatchObject({ content: "", allowCsvDownload: false, contentWithheld: expect.stringContaining("turned off downloads") as unknown });
  });

  it("should give a team member's connection the rows", async () => {
    data.loadArtifactForViewer.mockResolvedValue(read(true));
    expect(JSON.parse((await call("artifacts_get", { id: publicId })).text)).toMatchObject({ content: rows });
  });

  it("should give any connection the rows when downloads are on", async () => {
    data.loadArtifactForViewer.mockResolvedValue(read(false, true));
    expect(JSON.parse((await call("artifacts_get", { id: publicId })).text)).toMatchObject({ content: rows });
  });
});

describe("an agent trying to turn downloads on", () => {
  it("should never change the setting through artifacts_update", async () => {
    data.getEditableArtifactDto.mockResolvedValue(dto(false));
    const result = await call("artifacts_update", { id: publicId, allowCsvDownload: true });
    expect(data.setCsvDownload).not.toHaveBeenCalled();
    expect(data.updateArtifact).not.toHaveBeenCalled();
    if (!result.isError) expect(JSON.parse(result.text)).toMatchObject({ artifact: { allowCsvDownload: false } });
  });
});
