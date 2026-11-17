import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerAllTools } from "./register-tools";

/*
 * `anthropic/alwaysLoad` asks Claude Code to load a tool up front instead of
 * behind tool search. Every always-loaded tool costs context in every
 * session (its description and input schema), so only three carry it:
 * - artifacts_create: saving is the step an agent must find without
 *   searching. It is the large one: its inputs are most of the cost.
 * - artifacts_get: a person who hands an agent an artifact's link or id
 *   expects it read in one call. An agent that had only artifacts_create
 *   loaded took the id to another tool and never found this one. Its only
 *   input is the artifact.
 * - artifacts_list: finding earlier work comes before reading or changing
 *   it, and the instructions tell agents to search before they create.
 *   Five short inputs.
 * Every other tool stays behind tool search. The tools come from
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
  const upFront = ["artifacts_create", "artifacts_get", "artifacts_list"];

  it("should mark only saving, reading, and finding an artifact to load up front when a client lists the tools", async () => {
    const { tools } = await client.listTools();
    const alwaysLoaded = tools.filter((tool) => tool._meta?.["anthropic/alwaysLoad"] === true).map((tool) => tool.name);
    expect(tools.length).toBeGreaterThan(20);
    expect(alwaysLoaded.sort()).toEqual(upFront);
  });

  it("should leave every other tool without _meta when a client lists the tools", async () => {
    const { tools } = await client.listTools();
    const withMeta = tools.filter((tool) => tool._meta !== undefined).map((tool) => tool.name);
    expect(withMeta.sort()).toEqual(upFront);
  });

  it("should keep the two read tools small, since every session pays for what loads up front", async () => {
    const { tools } = await client.listTools();
    for (const name of ["artifacts_get", "artifacts_list"]) {
      const tool = tools.find((item) => item.name === name);
      const size = JSON.stringify({ description: tool?.description, inputSchema: tool?.inputSchema }).length;
      expect(size, name).toBeLessThan(2000);
    }
  });
});
