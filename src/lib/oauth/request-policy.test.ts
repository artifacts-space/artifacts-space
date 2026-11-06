import { describe, expect, it } from "vitest";

import { oauthErrorResponse, publicOAuthEndpoint, withPolicyScope } from "./request-policy";

describe("publicOAuthEndpoint", () => {
  it("should match registration, authorization, and token requests by method", () => {
    expect(publicOAuthEndpoint("POST", "/api/auth/oauth2/register")).toBe("register");
    expect(publicOAuthEndpoint("GET", "/api/auth/oauth2/authorize")).toBe("authorize");
    expect(publicOAuthEndpoint("POST", "/api/auth/oauth2/token/")).toBe("token");
  });

  it("should return null for every other auth request", () => {
    expect(publicOAuthEndpoint("GET", "/api/auth/oauth2/register")).toBeNull();
    expect(publicOAuthEndpoint("POST", "/api/auth/sign-in/magic-link")).toBeNull();
    expect(publicOAuthEndpoint("POST", "/api/auth/oauth2/consent")).toBeNull();
  });
});

describe("withPolicyScope", () => {
  it("should rewrite only the scope when the client asked for none", () => {
    const url = new URL("https://artifacts.space/api/auth/oauth2/authorize?client_id=c&state=s");
    const next = withPolicyScope(url);
    expect(next.searchParams.get("scope")).toBe("artifacts:read artifacts:write offline_access");
    expect(next.searchParams.get("client_id")).toBe("c");
    expect(next.searchParams.get("state")).toBe("s");
    expect(url.searchParams.has("scope")).toBe(false);
  });
});

describe("oauthErrorResponse", () => {
  it("should send an OAuth error body that caches never keep", async () => {
    const response = oauthErrorResponse(429, "rate_limited", "Slow down.", { "Retry-After": "60" });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "rate_limited", error_description: "Slow down." });
  });
});
