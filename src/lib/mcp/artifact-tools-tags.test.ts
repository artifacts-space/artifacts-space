import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto, ArtifactProjectDto } from "@/lib/artifact-types";

/*
 * Tags on artifacts_create, artifacts_update, and artifacts_list, through
 * the real MCP server and client over an in-memory transport. Storage and
 * tag writes are mocked at the data layer.
 */

const data = vi.hoisted(() => ({
  createArtifact: vi.fn(),
  updateArtifact: vi.fn(),
  getEditableArtifactDto: vi.fn(),
  listArtifacts: vi.fn(),
  getEditableArtifact: vi.fn(),
  setArtifactProject: vi.fn(),
  setArtifactTags: vi.fn(),
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
vi.mock("@/lib/tags/store", () => ({ setArtifactTags: data.setArtifactTags }));
vi.mock("@/lib/teams/queries", () => ({ listTeamsForUser: () => Promise.resolve([]) }));
vi.mock("@/lib/sharing/comments", () => ({ setArtifactComments: vi.fn() }));
vi.mock("@/lib/sharing/service", () => ({ requestArtifactSharing: vi.fn() }));
vi.mock("@/lib/site-origin", () => ({ siteUrl: (path: string) => `https://artifacts.space${path}` }));

const { registerArtifactTools } = await import("./artifact-tools");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";

function dto(project: ArtifactProjectDto | null, tags: string[] = []): ArtifactDto {
  return {
    id: "internal-1", publicId, title: "Plan", icon: null, theme: null, cover: null, fullWidth: false, sheetFormat: { banding: null, align: {} }, summary: "", content: "# Plan", kind: "markdown", language: "", project, tags, sessionId: "", source: "",
    visibility: "private", comments: "team", showInSearch: false, teamId: null, authorId: "agent-1", originalAuthorId: null, pendingSharing: null, pendingEdit: null, pendingComments: null, harness: null,
    files: [], updatedBy: null, metadata: {}, createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z",
  };
}

const billing = { id: "p1", name: "Billing", icon: "🧾" };
let client: Client;

beforeEach(async () => {
  vi.resetAllMocks();
  data.getEditableArtifact.mockResolvedValue({ id: "internal-1", publicId });
  data.setArtifactProject.mockResolvedValue(billing);
  data.setArtifactTags.mockResolvedValue(["launch", "q4"]);
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

describe("artifacts_create with tags", () => {
  it("should pass the tags to the create and return them", async () => {
    data.createArtifact.mockResolvedValue(dto(null, ["launch"]));
    const result = await call("artifacts_create", { title: "Plan", content: "# Plan", tags: ["Launch"] });
    expect(data.createArtifact).toHaveBeenCalledWith("agent-1", expect.objectContaining({ tags: ["Launch"] }), { harness: null });
    expect(JSON.parse(result.text)).toMatchObject({ artifact: { tags: ["launch"] } });
  });
});

describe("artifacts_update with tags", () => {
  it("should replace the tags without saving a version when only tags are sent", async () => {
    data.getEditableArtifactDto.mockResolvedValue(dto(null, ["old"]));
    const result = await call("artifacts_update", { id: publicId, tags: ["Launch", "q4"] });
    expect(result.isError).toBe(false);
    expect(data.setArtifactTags).toHaveBeenCalledWith("agent-1", "internal-1", { set: ["launch", "q4"] });
    expect(data.updateArtifact).not.toHaveBeenCalled();
    expect(JSON.parse(result.text)).toMatchObject({ edit: "unchanged", artifact: { tags: ["launch", "q4"] } });
  });

  it("should add and remove some tags when addTags and removeTags are sent", async () => {
    data.getEditableArtifactDto.mockResolvedValue(dto(null));
    await call("artifacts_update", { id: publicId, addTags: ["q4"], removeTags: ["old"] });
    expect(data.setArtifactTags).toHaveBeenCalledWith("agent-1", "internal-1", { add: ["q4"], remove: ["old"] });
  });

  it("should refuse tags together with addTags and change nothing", async () => {
    const result = await call("artifacts_update", { id: publicId, title: "New", tags: ["a"], addTags: ["b"] });
    expect(result.isError).toBe(true);
    expect(data.updateArtifact).not.toHaveBeenCalled();
    expect(data.setArtifactTags).not.toHaveBeenCalled();
  });

  it("should save nothing, content included, when a tag is too long", async () => {
    const result = await call("artifacts_update", { id: publicId, content: "# New", tags: ["x".repeat(40)] });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("1 to 32 characters");
    expect(data.updateArtifact).not.toHaveBeenCalled();
    expect(data.setArtifactTags).not.toHaveBeenCalled();
  });

  it("should keep the tags as they were when the save fails", async () => {
    data.updateArtifact.mockRejectedValue(new Error("save failed"));
    const result = await call("artifacts_update", { id: publicId, title: "New title", tags: ["launch"] });
    expect(result.isError).toBe(true);
    expect(data.setArtifactTags).not.toHaveBeenCalled();
  });

  it("should leave the tags alone when no tag field is sent", async () => {
    data.updateArtifact.mockResolvedValue(dto(null));
    await call("artifacts_update", { id: publicId, title: "New title" });
    expect(data.setArtifactTags).not.toHaveBeenCalled();
  });

  it("should refuse the change when the caller cannot edit the artifact", async () => {
    data.getEditableArtifact.mockResolvedValue(null);
    const result = await call("artifacts_update", { id: publicId, tags: ["launch"] });
    expect(result.isError).toBe(true);
    expect(data.setArtifactTags).not.toHaveBeenCalled();
  });
});

describe("artifacts_list with tags", () => {
  it("should filter by every normalized tag when tags are sent", async () => {
    data.listArtifacts.mockResolvedValue([]);
    await call("artifacts_list", { tags: [" Launch ", "#Q4", " "] });
    expect(data.listArtifacts).toHaveBeenCalledWith("agent-1", expect.objectContaining({ tags: ["launch", "q4"] }));
  });

  it("should not filter when no tags are sent", async () => {
    data.listArtifacts.mockResolvedValue([]);
    await call("artifacts_list", {});
    expect(data.listArtifacts).toHaveBeenCalledWith("agent-1", expect.objectContaining({ tags: undefined }));
  });
});
