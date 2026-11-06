import { describe, expect, it } from "vitest";

import { claudeMcpAddCommand, claudeMcpAddOAuthCommand, mcpConfigJson, mcpEndpoint, mcpOAuthConfigJson, TOKEN_PLACEHOLDER } from "./mcp-config";

describe("mcpEndpoint", () => {
  it("should append the MCP path when given a bare origin", () => {
    expect(mcpEndpoint("https://artifacts.space")).toBe("https://artifacts.space/api/mcp");
  });

  it("should ignore a trailing slash when the origin has one", () => {
    expect(mcpEndpoint("http://localhost:3104/")).toBe("http://localhost:3104/api/mcp");
  });
});

describe("mcpConfigJson", () => {
  it("should fill in the token when one is given", () => {
    const config: unknown = JSON.parse(mcpConfigJson("https://artifacts.space", "artifacts_abc"));
    expect(config).toEqual({
      mcpServers: {
        artifacts: {
          url: "https://artifacts.space/api/mcp",
          headers: { Authorization: "Bearer artifacts_abc" },
        },
      },
    });
  });

  it("should use the placeholder when no token is given", () => {
    expect(mcpConfigJson("https://artifacts.space")).toContain(`"Authorization": "Bearer ${TOKEN_PLACEHOLDER}"`);
  });
});

describe("claudeMcpAddCommand", () => {
  it("should add an HTTP server with the bearer header when given a token", () => {
    expect(claudeMcpAddCommand("https://artifacts.space", "artifacts_abc")).toBe(
      'claude mcp add --transport http artifacts https://artifacts.space/api/mcp --header "Authorization: Bearer artifacts_abc"',
    );
  });
});

describe("claudeMcpAddOAuthCommand", () => {
  it("should add an HTTP server with no token header when used for OAuth", () => {
    expect(claudeMcpAddOAuthCommand("https://artifacts.space")).toBe("claude mcp add --transport http artifacts https://artifacts.space/api/mcp");
  });
});

describe("mcpOAuthConfigJson", () => {
  it("should hold only the endpoint URL when the client signs in with OAuth", () => {
    const config: unknown = JSON.parse(mcpOAuthConfigJson("http://localhost:3104/"));
    expect(config).toEqual({ mcpServers: { artifacts: { url: "http://localhost:3104/api/mcp" } } });
  });
});
