import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import type { McpAccess } from "@/lib/oauth/scopes";

import { registerArtifactTools } from "./artifact-tools";
import { registerFileTools } from "./file-tools";
import { registerFormatTools } from "./format-tools";
import { registerProjectTools } from "./project-tools";
import { registerTagTools } from "./tag-tools";
import { registerTeamTools } from "./team-tools";
import { registerThemeTools } from "./theme-tools";
import { gateTools, toolAccess, toolAllowed } from "./tool-access";
import { registerVersionTools } from "./version-tools";

/** The read-only tool set, spelled out so a reclassification shows up in review. */
const readOnlyTools = [
  "artifacts_formats_guide",
  "artifacts_get",
  "artifacts_list",
  "artifacts_validate",
  "artifacts_versions",
  "comments_list",
  "files_get_download_url",
  "inbox_list",
  "projects_list",
  "tags_list",
  "teams_list",
  "themes_list",
];

const closers: (() => Promise<void>)[] = [];

/** Registers every tool the MCP route registers, connects a client in memory, and lists the tools. */
async function connect(access: McpAccess) {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerArtifactTools(server, "user-1", access);
  registerProjectTools(server, "user-1", access);
  registerTagTools(server, "user-1", access);
  registerFormatTools(server, access);
  registerThemeTools(server, access);
  registerFileTools(server, "user-1", access);
  registerTeamTools(server, "user-1", access);
  registerVersionTools(server, "user-1", access);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closers.push(async () => {
    await client.close();
    await server.close();
  });
  const { tools } = await client.listTools();
  return { client, names: tools.map((tool) => tool.name).sort() };
}

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

describe("toolAccess", () => {
  it("should classify exactly the tools the MCP route registers when access is full", async () => {
    const { names } = await connect("full");
    expect(names).toEqual(Object.keys(toolAccess).sort());
  });

  it("should list only read tools when access is read-only", async () => {
    const { names } = await connect("read");
    expect(names).toEqual(readOnlyTools);
  });

  it("should treat every create, change, delete, share, comment, upload, and mark tool as a write", () => {
    const writes = Object.entries(toolAccess).filter(([, level]) => level === "write").map(([name]) => name).sort();
    expect(writes).toEqual([
      "artifacts_create",
      "artifacts_delete",
      "artifacts_restore_version",
      "artifacts_update",
      "comment_create",
      "comment_delete",
      "comment_update",
      "files_attach",
      "files_create_artifact",
      "files_delete",
      "files_finalize",
      "files_request_upload",
      "inbox_mark_read",
    ]);
  });
});

describe("read-only connections", () => {
  it("should refuse a write tool call when access is read-only", async () => {
    const { client } = await connect("read");
    const result = await client.callTool({ name: "artifacts_create", arguments: { title: "x", content: "y" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/not found/);
  });
});

describe("toolAllowed", () => {
  it("should throw when a tool has no access level", () => {
    expect(() => toolAllowed("artifacts_new_thing", "full")).toThrow(/no access level/);
  });

  it("should allow a read tool for read-only access and a write tool only for full access", () => {
    expect(toolAllowed("artifacts_get", "read")).toBe(true);
    expect(toolAllowed("artifacts_delete", "read")).toBe(false);
    expect(toolAllowed("artifacts_delete", "full")).toBe(true);
  });
});

describe("gateTools", () => {
  it("should refuse to register an unclassified tool when access is full", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const gated = gateTools(server, "full");
    expect(() => gated.registerTool("surprise_tool", { inputSchema: { x: z.string() } }, () => ({ content: [] }))).toThrow(/no access level/);
  });
});
