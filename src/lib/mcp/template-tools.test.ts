import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it } from "vitest";

import { validateArtifactContent } from "@/lib/artifact-content";
import type { McpAccess } from "@/lib/oauth/scopes";
import { uiTemplates } from "@/lib/ui/templates/index";

import { registerTemplateTools } from "./template-tools";

/* The template tools through the real MCP server and client: what each returns, and how a refusal reads. */

let client: Client | undefined;

async function connect(access: McpAccess = "full"): Promise<Client> {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerTemplateTools(server, access);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

afterEach(async () => {
  await client?.close();
  client = undefined;
});

interface ToolAnswer {
  isError?: boolean;
  content: { type: string; text: string }[];
}

async function call(name: string, args: Record<string, unknown> = {}, access: McpAccess = "full"): Promise<ToolAnswer> {
  return (await (await connect(access)).callTool({ name, arguments: args })) as ToolAnswer;
}

const textOf = (answer: ToolAnswer) => answer.content[0]?.text ?? "";
const valueOf = (answer: ToolAnswer) => JSON.parse(textOf(answer)) as Record<string, unknown>;

describe("ui_templates_list", () => {
  it("should list every template as a small row without a spec when no filter is given", async () => {
    const value = valueOf(await call("ui_templates_list"));
    const rows = value.templates as Record<string, unknown>[];
    expect(value.count).toBe(uiTemplates.length);
    expect(rows.map((row) => row.id)).toEqual(uiTemplates.map((template) => template.id));
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["category", "description", "elements", "id", "kind", "name", "viewport"]);
  });

  it("should list only the templates of one category when the filter names it", async () => {
    const rows = valueOf(await call("ui_templates_list", { category: "hero" })).templates as { id: string; category: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.category === "hero")).toBe(true);
  });

  it("should refuse a category that does not exist", async () => {
    const answer = await call("ui_templates_list", { category: "carousel" });
    expect(answer.isError).toBe(true);
  });
});

describe("ui_template_get", () => {
  it("should return a fragment whose keys and state carry the prefix when one is given", async () => {
    const value = valueOf(await call("ui_template_get", { id: "pricing-three-tiers", prefix: "plans" }));
    const fragment = value.fragment as { root: string; elements: Record<string, unknown>; state: Record<string, unknown> };
    expect(value.prefix).toBe("plans");
    expect(fragment.root).toBe("plans-pricing");
    expect(Object.keys(fragment.elements).every((key) => key.startsWith("plans-"))).toBe(true);
    expect(Object.keys(fragment.state)).toEqual(["plans"]);
    expect(value.spec).toBeUndefined();
    expect(String(value.attach)).toMatch(/put "plans-pricing" in the `children`/);
  });

  it("should return a complete spec that saves as a ui artifact when asked for one, for every template", async () => {
    for (const template of uiTemplates) {
      const value = valueOf(await call("ui_template_get", { id: template.id, as: "spec" }));
      await client?.close();
      const checked = validateArtifactContent("ui", JSON.stringify(value.spec));
      expect(checked.issues, template.id).toEqual([]);
    }
  });

  it("should answer with a tool error that names the list tool when no template has the id", async () => {
    const answer = await call("ui_template_get", { id: "hero-missing" });
    expect(answer.isError).toBe(true);
    expect(textOf(answer)).toMatch(/No template has the id "hero-missing"\. Call ui_templates_list for the ids\./);
  });

  it("should answer with a tool error that says what a prefix looks like when the prefix is not usable", async () => {
    const answer = await call("ui_template_get", { id: "hero-centered", prefix: "Not A Prefix" });
    expect(answer.isError).toBe(true);
    expect(textOf(answer)).toMatch(/`prefix` must be up to 40 lowercase letters, digits, and hyphens/);
  });
});

describe("the template tools on a read-only connection", () => {
  it("should offer both tools, marked read-only, when access is read-only", async () => {
    const { tools } = await (await connect("read")).listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["ui_template_get", "ui_templates_list"]);
    for (const tool of tools) expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
  });
});
