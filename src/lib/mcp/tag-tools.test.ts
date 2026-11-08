import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserFacingError } from "@/lib/user-facing-error";

/* tags_list through the real MCP server and client, with the data layer mocked. */

const data = vi.hoisted(() => ({ getTeamForMember: vi.fn(), assertScopeAccess: vi.fn(), scopeTags: vi.fn() }));
vi.mock("@/lib/teams/queries", () => ({ getTeamForMember: data.getTeamForMember }));
vi.mock("@/lib/projects/manage", () => ({ assertScopeAccess: data.assertScopeAccess }));
vi.mock("@/lib/projects/queries", () => ({ listScopeProjects: vi.fn() }));
vi.mock("@/lib/tags/queries", () => ({ scopeTags: data.scopeTags }));
vi.mock("@/lib/tags/store", () => ({ setArtifactTags: vi.fn() }));

const { registerTagTools } = await import("./tag-tools");

let client: Client;

beforeEach(async () => {
  vi.resetAllMocks();
  data.scopeTags.mockResolvedValue([{ tag: "launch", count: 3 }]);
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerTagTools(server, "agent-1", "read");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

async function call(args: Record<string, unknown>) {
  const result = (await client.callTool({ name: "tags_list", arguments: args })) as { isError?: boolean; content: { text: string }[] };
  return { isError: result.isError === true, text: result.content[0]?.text ?? "" };
}

describe("tags_list", () => {
  it("should list the caller's own tags with counts when the scope is mine", async () => {
    const result = await call({});
    expect(JSON.parse(result.text)).toEqual([{ tag: "launch", count: 3 }]);
    expect(data.scopeTags).toHaveBeenCalledWith({ kind: "user", userId: "agent-1" });
  });

  it("should list a shared team's tags when the caller belongs to it", async () => {
    data.getTeamForMember.mockResolvedValue({ id: "t1", personal: false });
    await call({ scope: "Acme" });
    expect(data.getTeamForMember).toHaveBeenCalledWith("agent-1", "acme");
    expect(data.scopeTags).toHaveBeenCalledWith({ kind: "team", teamId: "t1" });
  });

  it("should refuse a team the caller is not in and list nothing", async () => {
    data.getTeamForMember.mockResolvedValue(null);
    const result = await call({ scope: "other" });
    expect(result.isError).toBe(true);
    expect(data.scopeTags).not.toHaveBeenCalled();
  });

  it("should refuse when the scope access check fails", async () => {
    data.assertScopeAccess.mockRejectedValue(new UserFacingError("Not found."));
    const result = await call({});
    expect(result.isError).toBe(true);
    expect(data.scopeTags).not.toHaveBeenCalled();
  });
});
