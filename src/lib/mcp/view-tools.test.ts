import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getEditableArtifact: vi.fn(), loadViewStats: vi.fn() }));

vi.mock("@/lib/access", () => ({ getEditableArtifact: mocks.getEditableArtifact }));
vi.mock("@/lib/views/view-stats", () => ({ loadViewStats: mocks.loadViewStats }));

const { registerViewTools } = await import("./view-tools");

const publicId = "AbCdEfGhJkLmNpQrStUvWx";
const closers: (() => Promise<void>)[] = [];

async function connect(userId: string) {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerViewTools(server, userId, "read");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closers.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

describe("artifacts_views", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.loadViewStats.mockResolvedValue({ days: 30, counting: true, totals: { views: 9, visitors: 4 }, daily: [], referrers: [] });
  });

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  it("should return the counts when the agent may edit the artifact, even on a read-only connection", async () => {
    mocks.getEditableArtifact.mockResolvedValue({ id: "artifact-1", visibility: "public" });
    const client = await connect("agent-1");
    const result = await client.callTool({ name: "artifacts_views", arguments: { id: publicId } });
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain("\\\"views\\\": 9");
    expect(mocks.getEditableArtifact).toHaveBeenCalledWith("agent-1", { publicId });
  });

  it("should refuse an agent that cannot edit the artifact without reading any counts", async () => {
    mocks.getEditableArtifact.mockResolvedValue(null);
    const client = await connect("stranger-1");
    const result = await client.callTool({ name: "artifacts_views", arguments: { id: publicId } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/cannot edit it/);
    expect(mocks.loadViewStats).not.toHaveBeenCalled();
  });

  it("should refuse a range other than 30 or 90 days", async () => {
    mocks.getEditableArtifact.mockResolvedValue({ id: "artifact-1", visibility: "public" });
    const client = await connect("agent-1");
    const result = await client.callTool({ name: "artifacts_views", arguments: { id: publicId, days: 365 } });
    expect(result.isError).toBe(true);
    expect(mocks.loadViewStats).not.toHaveBeenCalled();
  });
});
