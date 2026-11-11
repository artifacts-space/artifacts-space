import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto } from "@/lib/artifact-types";
import { EditConflictError } from "@/lib/edits/conflict-error";

/*
 * Concurrent edits over MCP, through the real MCP server and client: agents
 * get the version they read (`versionId`, `baseVersion`) with every artifact
 * they may edit, send `baseVersion` back with updates and restores, and get a
 * typed tool error when a save is refused. Storage is mocked at the data layer.
 */

const data = vi.hoisted(() => ({
  createArtifact: vi.fn(),
  updateArtifact: vi.fn(),
  restoreArtifactVersion: vi.fn(),
  getEditableArtifact: vi.fn(),
  loadArtifactForViewer: vi.fn(),
  requestArtifactSharing: vi.fn(),
  setArtifactProject: vi.fn(),
}));
vi.mock("@/lib/artifacts", () => ({
  createArtifact: data.createArtifact,
  updateArtifact: data.updateArtifact,
  restoreArtifactVersion: data.restoreArtifactVersion,
  deleteArtifact: vi.fn(),
  getOwnArtifactByPublicId: vi.fn(),
  listArtifacts: vi.fn(),
}));
vi.mock("@/lib/access", () => ({ getEditableArtifact: data.getEditableArtifact }));
vi.mock("@/lib/artifact-read", () => ({ loadArtifactForViewer: data.loadArtifactForViewer }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: () => Promise.resolve([]) }));
vi.mock("@/lib/sharing/comments", () => ({ setArtifactComments: vi.fn() }));
vi.mock("@/lib/sharing/service", () => ({ requestArtifactSharing: data.requestArtifactSharing }));
vi.mock("@/lib/projects/store", () => ({ setArtifactProject: data.setArtifactProject }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));
vi.mock("@/lib/versions/history", () => ({ latestVersion: () => Promise.resolve({ id: versionId }), versionAt: () => Promise.resolve({ id: versionId }) }));
vi.mock("@/lib/versions/history-queries", () => ({ getArtifactVersionDetail: vi.fn(), listArtifactVersions: vi.fn() }));

const versionId = "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f";
const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";
const savedAt = "2026-11-11T13:08:00.123Z";
const token = `${versionId}.${String(Date.parse(savedAt))}`;

const { registerArtifactTools } = await import("./artifact-tools");
const { registerVersionTools } = await import("./version-tools");

function dto(updatedAt = savedAt): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Answers", icon: null, theme: null, cover: null, fullWidth: false, sheetFormat: { banding: null, align: {} }, allowCsvDownload: false, summary: "", content: "# Answers", kind: "markdown", language: "", project: null, tags: [], sessionId: "", source: "",
    visibility: "private", comments: "team", showInSearch: false, teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null, harness: null,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-07T00:00:00.000Z", updatedAt,
  };
}

const read = (canEdit: boolean, source: "latest" | "approved" = "latest") => ({ dto: dto(), viewable: { canEdit, version: { source }, editPending: false } });

let client: Client;

beforeEach(async () => {
  vi.resetAllMocks();
  data.getEditableArtifact.mockResolvedValue({ id: "internal-1", publicId, cover: null });
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerArtifactTools(server, "agent-1", "full");
  registerVersionTools(server, "agent-1", "full");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
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
  return { isError: result.isError === true, text: result.content[0]?.text ?? "", structured: result.structuredContent };
}

describe("artifacts_get base version", () => {
  it("should return the version id and baseVersion when the caller can edit it", async () => {
    data.loadArtifactForViewer.mockResolvedValue(read(true));
    expect(JSON.parse((await call("artifacts_get", { id: publicId })).text)).toMatchObject({ versionId, baseVersion: token });
  });

  it("should leave them out when the caller cannot edit it or reads the approved version", async () => {
    data.loadArtifactForViewer.mockResolvedValue(read(false));
    expect(JSON.parse((await call("artifacts_get", { id: publicId })).text)).not.toHaveProperty("baseVersion");
    data.loadArtifactForViewer.mockResolvedValue(read(true, "approved"));
    expect(JSON.parse((await call("artifacts_get", { id: publicId })).text)).not.toHaveProperty("baseVersion");
  });
});

describe("artifacts_update base version", () => {
  it("should pass baseVersion to the save and return the new one when it saves", async () => {
    data.updateArtifact.mockResolvedValue(dto("2026-11-11T13:15:00.000Z"));
    const result = await call("artifacts_update", { id: publicId, content: "# Answers v2", baseVersion: token });
    expect(result.isError).toBe(false);
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", expect.objectContaining({ content: "# Answers v2" }), "agent", expect.objectContaining({ baseVersion: token }));
    expect(JSON.parse(result.text)).toMatchObject({ artifact: { baseVersion: `${versionId}.${String(Date.parse("2026-11-11T13:15:00.000Z"))}` } });
  });

  it("should return a typed tool error that names who changed it when the artifact changed since the agent read it", async () => {
    data.updateArtifact.mockRejectedValue(new EditConflictError("changed", { handle: "charles", harness: null }));
    const result = await call("artifacts_update", { id: publicId, content: "# Stale", baseVersion: token });
    expect(result.isError).toBe(true);
    expect(result.text).toBe("This artifact changed since you read it (by @charles via the web). Nothing was saved. Read it again with artifacts_get, merge your changes into the new content, and save with the new baseVersion.");
    expect(result.structured?.error).toEqual({ code: "artifact_changed", message: result.text, changedBy: { handle: "charles", via: "web" }, nextStep: "artifacts_get" });
  });

  it("should name the agent harness when another agent saved since", async () => {
    data.updateArtifact.mockRejectedValue(new EditConflictError("changed", { handle: "charles", harness: { id: "claude-code", name: "Claude Code" } }));
    const result = await call("artifacts_update", { id: publicId, content: "# Stale", baseVersion: token });
    expect(result.text).toContain("(by @charles via Claude Code)");
    expect(result.structured?.error?.changedBy).toEqual({ handle: "charles", via: "Claude Code" });
  });

  it("should return the being-edited error when a person is typing and the agent sent no baseVersion", async () => {
    data.updateArtifact.mockRejectedValue(new EditConflictError("editing", { handle: "charles", harness: null }));
    const result = await call("artifacts_update", { id: publicId, content: "# Old client" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/^@charles is editing this artifact in the web app right now\. Nothing was saved\./);
    expect(result.structured?.error?.code).toBe("artifact_being_edited");
  });

  it("should not share, move, or tag after a refused save", async () => {
    data.updateArtifact.mockRejectedValue(new EditConflictError("changed", null));
    const result = await call("artifacts_update", { id: publicId, content: "# Stale", baseVersion: token, visibility: "team", project: "Plans" });
    expect(result.isError).toBe(true);
    expect(result.structured?.error?.changedBy).toBeNull();
    expect(data.requestArtifactSharing).not.toHaveBeenCalled();
    expect(data.setArtifactProject).not.toHaveBeenCalled();
  });
});

describe("artifacts_restore_version base version", () => {
  it("should pass baseVersion and return the same typed error when the restore is refused", async () => {
    data.restoreArtifactVersion.mockRejectedValue(new EditConflictError("changed", { handle: "charles", harness: null }));
    const result = await call("artifacts_restore_version", { id: publicId, version: versionId, baseVersion: token });
    expect(data.restoreArtifactVersion).toHaveBeenCalledWith("agent-1", "internal-1", versionId, "agent", expect.objectContaining({ baseVersion: token }));
    expect(result.isError).toBe(true);
    expect(result.structured?.error?.code).toBe("artifact_changed");
  });

  it("should return the new baseVersion when the restore saves", async () => {
    data.restoreArtifactVersion.mockResolvedValue({ artifact: dto(), savedOverAgents: false });
    const result = await call("artifacts_restore_version", { id: publicId, version: versionId, baseVersion: token });
    expect(JSON.parse(result.text)).toMatchObject({ versionId, baseVersion: token });
  });
});
