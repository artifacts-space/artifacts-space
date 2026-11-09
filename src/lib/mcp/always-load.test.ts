import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerAllTools } from "./register-tools";

/*
 * `anthropic/alwaysLoad` asks Claude Code to load a tool up front instead of
 * behind tool search. Every always-loaded tool costs context in every
 * session, so only artifacts_create carries it. The tools come from
 * registerAllTools, as src/app/api/mcp/route.ts registers them, and the list
 * comes through the SDK's own client, which shows a standard client accepts
 * the extra `_meta` key. Nothing here
 * calls a handler, so no storage is touched.
 */

let client: Client;

beforeEach(async () => {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerAllTools(server, "user-1", "full");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
});

describe("anthropic/alwaysLoad", () => {
  it("should mark only artifacts_create to load up front when a client lists the tools", async () => {
    const { tools } = await client.listTools();
    const alwaysLoaded = tools.filter((tool) => tool._meta?.["anthropic/alwaysLoad"] === true).map((tool) => tool.name);
    expect(tools.length).toBeGreaterThan(20);
    expect(alwaysLoaded).toEqual(["artifacts_create"]);
  });

  it("should leave every other tool without _meta when a client lists the tools", async () => {
    const { tools } = await client.listTools();
    const withMeta = tools.filter((tool) => tool._meta !== undefined).map((tool) => tool.name);
    expect(withMeta).toEqual(["artifacts_create"]);
  });
});
