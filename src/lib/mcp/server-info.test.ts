import { existsSync } from "node:fs";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ImplementationSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import { mcpServerInfo } from "./server-info";

const env = { BETTER_AUTH_URL: "https://artifacts.example.com" } as unknown as NodeJS.ProcessEnv;

describe("mcpServerInfo", () => {
  it("should give a title, the website, a description, and icons when the site origin is set", () => {
    const info = mcpServerInfo(env);
    expect(ImplementationSchema.parse(info)).toEqual(info);
    expect(info.title).toBe("artifacts.space");
    expect(info.websiteUrl).toBe("https://artifacts.example.com");
    expect(info.description?.length).toBeGreaterThan(0);
    expect(info.icons?.map((icon) => icon.src)).toEqual([
      "https://artifacts.example.com/artifacts-space-icon.png",
      "https://artifacts.example.com/icon.svg",
    ]);
  });

  it("should point only at icon files the site already serves when it lists icons", () => {
    expect(existsSync("public/artifacts-space-icon.png")).toBe(true);
    expect(existsSync("src/app/icon.svg")).toBe(true);
  });

  it("should reach the client in initialize when a server is created with it", async () => {
    const server = new McpServer(mcpServerInfo(env));
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      expect(client.getServerVersion()).toMatchObject({ name: "artifacts.space", title: "artifacts.space", websiteUrl: "https://artifacts.example.com" });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
