import { describe, expect, it } from "vitest";

import { bearerChallenge, oauthIssuer, protectedResourceMetadata, suffixPath } from "./metadata";

const env: NodeJS.ProcessEnv = { NODE_ENV: "test", BETTER_AUTH_URL: "https://artifacts.space" };

describe("protectedResourceMetadata", () => {
  it("should name the MCP resource, this issuer, and the artifacts scopes", () => {
    expect(protectedResourceMetadata(env)).toEqual({
      resource: "https://artifacts.space/api/mcp",
      authorization_servers: ["https://artifacts.space/api/auth"],
      bearer_methods_supported: ["header"],
      scopes_supported: ["artifacts:read", "artifacts:write"],
      resource_name: "artifacts.space",
    });
  });
});

describe("oauthIssuer", () => {
  it("should be Better Auth's base URL when the app URL has a trailing slash", () => {
    expect(oauthIssuer({ ...env, BETTER_AUTH_URL: "http://localhost:3104/" })).toBe("http://localhost:3104/api/auth");
  });
});

describe("bearerChallenge", () => {
  it("should point clients at the path-suffixed resource metadata when no token was sent", () => {
    expect(bearerChallenge(env)).toBe('Bearer resource_metadata="https://artifacts.space/.well-known/oauth-protected-resource/api/mcp", scope="artifacts:read artifacts:write"');
  });

  it("should add invalid_token when a token was sent but refused", () => {
    expect(bearerChallenge(env, "invalid_token")).toMatch(/^Bearer error="invalid_token", resource_metadata="/);
  });
});

describe("suffixPath", () => {
  it("should join path segments and give an empty string for none", () => {
    expect(suffixPath(["api", "mcp"])).toBe("/api/mcp");
    expect(suffixPath(undefined)).toBe("");
  });
});
