import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto, ArtifactProjectDto } from "@/lib/artifact-types";

/*
 * `project` on artifacts_create, artifacts_update, and artifacts_list,
 * through the real MCP server and client over an in-memory transport.
 * Storage and project linking are mocked at the data layer.
 */

const data = vi.hoisted(() => ({
  createArtifact: vi.fn(),
  updateArtifact: vi.fn(),
  getEditableArtifactDto: vi.fn(),
  listArtifacts: vi.fn(),
  getEditableArtifact: vi.fn(),
  setArtifactProject: vi.fn(),
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
vi.mock("@/lib/artifact-read", () => ({ loadArtifactForViewer: vi.fn() }));
vi.mock("@/lib/projects/store", () => ({ setArtifactProject: data.setArtifactProject }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: () => Promise.resolve([]) }));
vi.mock("@/lib/sharing/comments", () => ({ setArtifactComments: vi.fn() }));
vi.mock("@/lib/sharing/service", () => ({ requestArtifactSharing: vi.fn() }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));

const { registerArtifactTools } = await import("./artifact-tools");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";

function dto(project: ArtifactProjectDto | null): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Plan", icon: null, theme: null, cover: null, summary: "", content: "# Plan", kind: "markdown", language: "", project, tags: [], sessionId: "", source: "",
    visibility: "private", comments: "team", showInSearch: false, teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z",
  };
}

const billing = { id: "p1", name: "Billing", icon: "🧾" };
let client: Client;

beforeEach(async () => {
  vi.resetAllMocks();
  data.getEditableArtifact.mockResolvedValue({ id: "internal-1", publicId });
  data.setArtifactProject.mockResolvedValue(billing);
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

describe("artifacts_create with project", () => {
  it("should pass the project name to the create and return it", async () => {
    data.createArtifact.mockResolvedValue(dto(billing));
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", project: "billing" });
    expect(result.isError).toBe(false);
    expect(data.createArtifact).toHaveBeenCalledWith("agent-1", expect.objectContaining({ project: "billing" }));
    expect((JSON.parse(result.text) as { artifact: { project: string } }).artifact.project).toBe("Billing");
  });

  it("should return an empty project name when the artifact has none", async () => {
    data.createArtifact.mockResolvedValue(dto(null));
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan" });
    expect((JSON.parse(result.text) as { artifact: { project: string } }).artifact.project).toBe("");
  });
});

describe("artifacts_update with project", () => {
  it("should move the artifact without saving a version when only the project is sent", async () => {
    data.getEditableArtifactDto.mockResolvedValue(dto(billing));
    const result = await call("artifacts_update", { id: publicId, project: "Billing" });
    expect(result.isError).toBe(false);
    expect(data.setArtifactProject).toHaveBeenCalledWith("agent-1", "internal-1", { name: "Billing" });
    expect(data.updateArtifact).not.toHaveBeenCalled();
    expect(JSON.parse(result.text)).toMatchObject({ edit: "unchanged", artifact: { project: "Billing" } });
  });

  it("should clear the project when null or an empty name is sent", async () => {
    data.getEditableArtifactDto.mockResolvedValue(dto(null));
    await call("artifacts_update", { id: publicId, project: null });
    await call("artifacts_update", { id: publicId, project: "  " });
    expect(data.setArtifactProject).toHaveBeenNthCalledWith(1, "agent-1", "internal-1", { none: true });
    expect(data.setArtifactProject).toHaveBeenNthCalledWith(2, "agent-1", "internal-1", { none: true });
  });

  it("should save the other fields as a version and keep the project out of them", async () => {
    data.updateArtifact.mockResolvedValue(dto(billing));
    const result = await call("artifacts_update", { id: publicId, title: "New title", project: "Billing" });
    expect(data.updateArtifact).toHaveBeenCalledWith("agent-1", "internal-1", { title: "New title" }, "agent");
    expect(JSON.parse(result.text)).toMatchObject({ edit: "applied" });
  });

  it("should refuse the change when the caller cannot edit the artifact", async () => {
    data.getEditableArtifact.mockResolvedValue(null);
    const result = await call("artifacts_update", { id: publicId, project: "Billing" });
    expect(result.isError).toBe(true);
    expect(data.setArtifactProject).not.toHaveBeenCalled();
  });

  it("should keep the project as it was when the save fails", async () => {
    data.updateArtifact.mockRejectedValue(new Error("save failed"));
    const result = await call("artifacts_update", { id: publicId, title: "New title", project: "Billing" });
    expect(result.isError).toBe(true);
    expect(data.setArtifactProject).not.toHaveBeenCalled();
  });

  it("should return the new project after a save that read the artifact before the move", async () => {
    data.updateArtifact.mockResolvedValue(dto(null));
    const result = await call("artifacts_update", { id: publicId, title: "New title", project: "Billing" });
    expect(JSON.parse(result.text)).toMatchObject({ artifact: { project: "Billing" } });
  });

  it("should leave the project alone when it is not sent", async () => {
    data.updateArtifact.mockResolvedValue(dto(null));
    await call("artifacts_update", { id: publicId, title: "New title" });
    expect(data.setArtifactProject).not.toHaveBeenCalled();
  });
});

describe("artifacts_list with project", () => {
  it("should filter by the project's name key when a name is sent", async () => {
    data.listArtifacts.mockResolvedValue([]);
    await call("artifacts_list", { project: "  BILLING " });
    expect(data.listArtifacts).toHaveBeenCalledWith("agent-1", expect.objectContaining({ project: { key: "billing" } }));
  });

  it("should not filter when no project is sent", async () => {
    data.listArtifacts.mockResolvedValue([]);
    await call("artifacts_list", {});
    expect(data.listArtifacts).toHaveBeenCalledWith("agent-1", expect.objectContaining({ project: undefined }));
  });
});
