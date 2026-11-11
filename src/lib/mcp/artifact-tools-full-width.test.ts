import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto, ArtifactListItemDto } from "@/lib/artifact-types";

/*
 * `fullWidth` on artifacts_get, artifacts_list, and artifacts_update,
 * through the real MCP server and client over an in-memory transport.
 * Storage and the setting's write are mocked at the data layer.
 */

const data = vi.hoisted(() => ({
  updateArtifact: vi.fn(),
  getEditableArtifactDto: vi.fn(),
  listArtifacts: vi.fn(),
  getEditableArtifact: vi.fn(),
  loadArtifactForViewer: vi.fn(),
  setArtifactFullWidth: vi.fn(),
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
vi.mock("@/lib/projects/store", () => ({ setArtifactProject: vi.fn() }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: () => Promise.resolve([]) }));
vi.mock("@/lib/sharing/comments", () => ({ setArtifactComments: vi.fn() }));
vi.mock("@/lib/sharing/service", () => ({ requestArtifactSharing: vi.fn() }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));

vi.mock("@/lib/versions/history", () => ({ latestVersion: () => Promise.resolve({ id: "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f" }) }));
const { registerArtifactTools } = await import("./artifact-tools");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";

function dto(fullWidth: boolean): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Plan", icon: null, theme: null, cover: null, fullWidth, sheetFormat: { banding: null, align: {} }, allowCsvDownload: false, summary: "", content: "# Plan", kind: "markdown", language: "", project: null, tags: [], sessionId: "", source: "",
    visibility: "private", comments: "team", showInSearch: false, teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null, harness: null,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z",
  };
}

function listItem(fullWidth: boolean): ArtifactListItemDto {
  return { ...dto(fullWidth), preview: "# Plan" };
}

let client: Client;

beforeEach(async () => {
  vi.resetAllMocks();
  data.getEditableArtifact.mockResolvedValue({ id: "internal-1", publicId, cover: null });
  data.setArtifactFullWidth.mockImplementation((_userId: string, _id: string, fullWidth: boolean) => Promise.resolve({ publicId, fullWidth }));
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

describe("fullWidth in reads", () => {
  it("should show fullWidth when an agent gets an artifact", async () => {
    data.loadArtifactForViewer.mockResolvedValue({ dto: dto(true), viewable: { version: { source: "latest" }, editPending: false } });
    const result = await call("artifacts_get", { id: publicId });
    expect(JSON.parse(result.text)).toMatchObject({ fullWidth: true });
  });

  it("should show fullWidth on each item when an agent lists artifacts", async () => {
    data.listArtifacts.mockResolvedValue([listItem(false)]);
    const result = await call("artifacts_list", {});
    expect(JSON.parse(result.text)).toMatchObject([{ fullWidth: false }]);
  });
});

describe("artifacts_update with fullWidth", () => {
  it("should change the setting without saving a version when only fullWidth is sent", async () => {
    data.getEditableArtifactDto.mockResolvedValue(dto(false));
    const result = await call("artifacts_update", { id: publicId, fullWidth: true });
    expect(result.isError).toBe(false);
    expect(data.setArtifactFullWidth).toHaveBeenCalledWith("agent-1", "internal-1", true);
    expect(data.updateArtifact).not.toHaveBeenCalled();
    expect(JSON.parse(result.text)).toMatchObject({ edit: "unchanged", artifact: { fullWidth: true } });
  });

  it("should keep fullWidth out of the fields saved as a version", async () => {
    data.updateArtifact.mockResolvedValue(dto(false));
    await call("artifacts_update", { id: publicId, title: "New title", fullWidth: true });
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", { title: "New title" }, "agent", { harness: null });
  });

  it("should refuse and write nothing when the agent cannot edit the artifact", async () => {
    data.getEditableArtifact.mockResolvedValue(null);
    const result = await call("artifacts_update", { id: publicId, fullWidth: true });
    expect(result.isError).toBe(true);
    expect(data.setArtifactFullWidth).not.toHaveBeenCalled();
  });

  it("should refuse when the edit check fails at the write", async () => {
    data.getEditableArtifactDto.mockResolvedValue(dto(false));
    data.setArtifactFullWidth.mockResolvedValue(undefined);
    const result = await call("artifacts_update", { id: publicId, fullWidth: true });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("cannot edit");
  });

  it("should leave the setting alone when fullWidth is not sent", async () => {
    data.updateArtifact.mockResolvedValue(dto(false));
    await call("artifacts_update", { id: publicId, title: "New title" });
    expect(data.setArtifactFullWidth).not.toHaveBeenCalled();
  });

  it("should refuse a value that is not true or false", async () => {
    const result = await call("artifacts_update", { id: publicId, fullWidth: "yes" });
    expect(result.isError).toBe(true);
    expect(data.setArtifactFullWidth).not.toHaveBeenCalled();
  });
});
