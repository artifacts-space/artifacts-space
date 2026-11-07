import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserFacingError } from "@/lib/user-facing-error";

/* projects_list through the real MCP server and client, with the data layer mocked. */

const data = vi.hoisted(() => ({ getTeamForMember: vi.fn(), assertScopeAccess: vi.fn(), listScopeProjects: vi.fn() }));
vi.mock("@/lib/teams/queries", () => ({ getTeamForMember: data.getTeamForMember }));
vi.mock("@/lib/projects/manage", () => ({ assertScopeAccess: data.assertScopeAccess }));
vi.mock("@/lib/projects/queries", () => ({ listScopeProjects: data.listScopeProjects }));

const { registerProjectTools } = await import("./project-tools");

let client: Client;

beforeEach(async () => {
  vi.resetAllMocks();
  data.listScopeProjects.mockResolvedValue([{ id: "p1", name: "Billing", icon: "🧾", count: 3 }]);
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerProjectTools(server, "agent-1", "read");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

async function call(args: Record<string, unknown>) {
  const result = (await client.callTool({ name: "projects_list", arguments: args })) as { isError?: boolean; content: { text: string }[] };
  return { isError: result.isError === true, text: result.content[0]?.text ?? "" };
}

describe("projects_list", () => {
  it("should list the caller's own projects with name, icon, and count, without ids", async () => {
    const result = await call({});
    expect(data.listScopeProjects).toHaveBeenCalledWith({ kind: "user", userId: "agent-1" });
    expect(JSON.parse(result.text)).toEqual([{ name: "Billing", icon: "🧾", count: 3 }]);
  });

  it("should list a shared team's projects when the caller is a member", async () => {
    data.getTeamForMember.mockResolvedValue({ id: "team-1", personal: false });
    await call({ scope: "Acme" });
    expect(data.getTeamForMember).toHaveBeenCalledWith("agent-1", "acme");
    expect(data.listScopeProjects).toHaveBeenCalledWith({ kind: "team", teamId: "team-1" });
  });

  it("should refuse a team the caller is not in and list nothing", async () => {
    data.getTeamForMember.mockResolvedValue(null);
    const result = await call({ scope: "other" });
    expect(result.isError).toBe(true);
    expect(data.listScopeProjects).not.toHaveBeenCalled();
  });

  it("should refuse a personal team and point to mine", async () => {
    data.getTeamForMember.mockResolvedValue({ id: "personal-1", personal: true });
    const result = await call({ scope: "me" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Use scope "mine"');
  });

  it("should list nothing when the scope check refuses", async () => {
    data.assertScopeAccess.mockRejectedValue(new UserFacingError("Project not found."));
    const result = await call({});
    expect(result.isError).toBe(true);
    expect(data.listScopeProjects).not.toHaveBeenCalled();
  });
});
