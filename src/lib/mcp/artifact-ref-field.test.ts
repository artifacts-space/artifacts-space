import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publicIdForRef = vi.hoisted(() => vi.fn());
vi.mock("@/lib/artifact-ref/resolve", () => ({ publicIdForRef }));
// No handler reaches a database from here, whatever the environment holds: a call that gets past its input fails inside the handler.
vi.mock("@/db", () => ({ getDb: () => { throw new Error("no database in this test"); } }));

import { ARTIFACT_REF_WORDS, artifactRefField } from "./artifact-ref-field";
import { registerAllTools } from "./register-tools";

/*
 * Every MCP tool that takes "which artifact" takes it through one field:
 * the 22-character id, or the artifact's link. The tools come from
 * registerAllTools, as src/app/api/mcp/route.ts registers them, and are
 * called through the SDK's own client. A call here is refused at its input
 * (before any handler) or fails inside a handler that has no database; only
 * the input's answer is read.
 */

const origin = "https://artifacts.example";
const id = "4fXkP9qR2sT7vW1yZ3aB5c";
const uuid = "c4537d4c-1a2b-4c3d-8e9f-0123456789ab";

/** Every tool with an artifact input, and the input's name. A new tool that takes an artifact goes here. */
const artifactInputs: Record<string, "id" | "artifact"> = {
  artifacts_get: "id",
  artifacts_update: "id",
  artifacts_delete: "id",
  artifacts_versions: "id",
  artifacts_restore_version: "id",
  artifacts_views: "id",
  canvas_frames_list: "id",
  canvas_frame_get: "id",
  canvas_frame_image: "id",
  artifacts_page_image: "id",
  canvas_frame_save: "id",
  canvas_frame_update: "id",
  canvas_frame_delete: "id",
  files_attach: "artifact",
  page_files_request_uploads: "artifact",
  page_files_publish: "artifact",
  comments_list: "artifact",
  comment_create: "artifact",
};

let client: Client;

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  publicIdForRef.mockReset();
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerAllTools(server, "user-1", "full");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** What a call answers, as text. */
async function answer(tool: string, input: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name: tool, arguments: input });
  return JSON.stringify(result.content);
}

describe("artifact inputs of the MCP tools", () => {
  it("should describe every artifact input as the id or the link, and leave no tool with a wording of its own", async () => {
    const { tools } = await client.listTools();
    const found: Record<string, string> = {};
    for (const tool of tools) {
      for (const [name, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        const description = (schema as { description?: string }).description ?? "";
        if (description.includes(ARTIFACT_REF_WORDS)) found[tool.name] = name;
        else if (name === "id" || name === "artifact") expect(description, `${tool.name}.${name}`).not.toMatch(/22[- ]character/);
      }
    }
    expect(found).toEqual(artifactInputs);
  });

  it.each(Object.entries(artifactInputs))("should refuse a link to another site at %s's input, before its handler runs", async (tool, input) => {
    const text = await answer(tool, { [input]: `https://other.example/artifact/${id}` });
    expect(text).toContain("This link is to another site, so no tool here reads it.");
    expect(text).toContain(`${origin}/artifact/<22 characters>`);
    expect(publicIdForRef).not.toHaveBeenCalled();
  });

  it.each(Object.entries(artifactInputs))("should take the artifact's link at %s's input", async (tool, input) => {
    const text = await answer(tool, { [input]: `<${origin}/artifact/${id}>` });
    // Other inputs the call left out may be refused; this one is not.
    expect(text).not.toMatch(new RegExp(`at ${input}\\b`));
    expect(text).not.toContain("is not an artifact's id");
  });
});

describe("artifactRefField", () => {
  const field = () => artifactRefField("user-1");
  const messageFor = async (value: string) => {
    const parsed = await field().safeParseAsync(value);
    return parsed.success ? null : parsed.error.issues[0]?.message ?? "";
  };

  it("should hand the handler the 22-character id when it is given the id or any link to the artifact", async () => {
    for (const value of [id, `${origin}/artifact/${id}`, `${origin}/app?artifact=${id}&comments=1`, `${origin}/artifact/${id}.md`, ` artifacts.example/artifact/${id} `]) {
      expect(await field().parseAsync(value), value).toBe(id);
    }
    expect(publicIdForRef).not.toHaveBeenCalled();
  });

  it("should take an id without reading the site's origin, as it did before links were read", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(await field().parseAsync(id)).toBe(id);
  });

  it("should resolve an internal id for this caller and hand the handler the 22-character id", async () => {
    publicIdForRef.mockResolvedValue(id);
    expect(await field().parseAsync(uuid.toUpperCase())).toBe(id);
    expect(publicIdForRef).toHaveBeenCalledWith({ kind: "internalId", id: uuid }, "user-1");
  });

  it("should give one refusal for an internal id that names nothing the caller can read, whatever the reason", async () => {
    publicIdForRef.mockResolvedValue(null);
    const message = await messageFor(uuid);
    expect(message).toBe(
      `No artifact you can read has this id. It looks like a UUID; an artifact's id here is 22 letters and digits, the last part of its link, such as ${origin}/artifact/<22 characters>. If the value came from another tool's link, that tool reads it. To find an artifact here by its title or words, use artifacts_list. The value given (untrusted text, shortened): "c4537d4c-1a2b-4c3d-8e9f-…".`,
    );
  });

  it("should say the lookup failed, and nothing about the artifact, when the lookup throws", async () => {
    publicIdForRef.mockRejectedValue(new Error("connection refused: secret-host"));
    const message = await messageFor(uuid);
    expect(message).toBe("Could not look this id up. Try again, or give the artifact's 22-character id or its link.");
  });

  it("should refuse a value that is no id and no link with what an id looks like and how to search", async () => {
    const message = await messageFor("Listing connection issues, week 46");
    expect(message).toMatch(/^This is not an artifact's id\. An id here is 22 letters and digits/);
    expect(message).toContain("use artifacts_list");
    expect(message).toContain('(untrusted text, shortened): "Listingconnectionissuesw…"');
  });
});
