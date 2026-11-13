import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { mcpServerInfo } from "./server-info";

/*
 * server.json at the repository root is this server's entry for the MCP
 * Registry. It is published by hand, so these keep it matching what the
 * server itself reports.
 */

const entrySchema = z.object({
  name: z.string(),
  title: z.string(),
  description: z.string(),
  version: z.string(),
  remotes: z.array(z.object({ type: z.string(), url: z.string() })),
});

const entry = entrySchema.parse(JSON.parse(readFileSync(new URL("../../../server.json", import.meta.url), "utf8")));
const env = { BETTER_AUTH_URL: "https://artifacts.space" } as unknown as NodeJS.ProcessEnv;

describe("server.json", () => {
  it("should use the registry name tied to the artifacts.space domain", () => {
    expect(entry.name).toBe("space.artifacts/artifacts-space");
  });

  it("should keep the description within the registry's 100 characters", () => {
    expect(entry.description.length).toBeLessThanOrEqual(100);
  });

  it("should point at the hosted MCP endpoint over Streamable HTTP", () => {
    expect(entry.remotes).toEqual([{ type: "streamable-http", url: "https://artifacts.space/api/mcp" }]);
  });

  it("should report the same version and title as the server when they change", () => {
    const info = mcpServerInfo(env);
    expect(entry.version).toBe(info.version);
    expect(entry.title).toBe(info.title);
  });
});
