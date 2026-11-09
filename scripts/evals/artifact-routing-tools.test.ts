import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import { registerAllTools } from "@/lib/mcp/register-tools";
import { SERVER_INSTRUCTIONS } from "@/lib/mcp/routing-copy";

/*
 * The routing eval's stub serves `artifact-routing-tools.json`: the server
 * instructions and every tool exactly as a full-access connection lists them
 * (name, title, description, input schema, `_meta`). This test rebuilds that
 * list with registerAllTools, as src/app/api/mcp/route.ts does,
 * and fails when the file is stale. `pnpm eval:routing` refreshes it before
 * each pass; refresh it by hand with
 *   pnpm exec vitest run --update scripts/evals/artifact-routing-tools.test.ts
 * Nothing here calls a handler, so no storage is touched.
 */

async function shippedTools() {
  const server = new McpServer({ name: "artifacts.space", version: "1.0.0" }, { instructions: SERVER_INSTRUCTIONS });
  registerAllTools(server, "user-1", "full");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "routing-eval", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const { tools } = await client.listTools();
    return { instructions: client.getInstructions() ?? "", tools: tools.map(({ name, title, description, inputSchema, _meta }) => ({ name, title, description, inputSchema, ...(_meta ? { _meta } : {}) })) };
  } finally {
    await client.close();
  }
}

/** One tool per line, so the file stays short and a changed description shows as one changed line. */
function serialize(shipped: Awaited<ReturnType<typeof shippedTools>>) {
  const tools = shipped.tools.map((tool) => `    ${JSON.stringify(tool)}`).join(",\n");
  return `{\n  "instructions": ${JSON.stringify(shipped.instructions)},\n  "tools": [\n${tools}\n  ]\n}\n`;
}

describe("artifact-routing-tools.json", () => {
  it("should match the instructions and tools the server ships when the eval stub serves it", async () => {
    const shipped = await shippedTools();
    expect(shipped.tools.length).toBeGreaterThan(20);
    await expect(serialize(shipped)).toMatchFileSnapshot("./artifact-routing-tools.json");
  });
});
