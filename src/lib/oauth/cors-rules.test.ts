import { describe, expect, it } from "vitest";

import { corsOAuthEndpoint, corsPreflightHeaders, corsPreflightResponse, corsResponseHeaders, withCorsHeaders, withoutCookies } from "./cors-rules";

describe("corsOAuthEndpoint", () => {
  it("should open the token and revoke endpoints when a browser client calls them", () => {
    expect(corsOAuthEndpoint("/api/auth/oauth2/token")).toBe("token");
    expect(corsOAuthEndpoint("/api/auth/oauth2/revoke/")).toBe("revoke");
  });

  it("should keep every other auth path closed when it is asked about", () => {
    for (const path of ["/api/auth/oauth2/introspect", "/api/auth/oauth2/register", "/api/auth/oauth2/authorize", "/api/auth/oauth2/userinfo", "/api/auth/get-session", "/api/auth/sign-in/magic-link", "/api/auth/oauth2/token/extra"]) {
      expect(corsOAuthEndpoint(path)).toBeNull();
    }
  });
});

describe("CORS headers", () => {
  it("should allow every origin but never credentials when it answers", () => {
    for (const headers of [corsResponseHeaders, corsPreflightHeaders]) {
      expect(headers["Access-Control-Allow-Origin"]).toBe("*");
      expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain("access-control-allow-credentials");
    }
  });

  it("should allow only POST with content-type and authorization when a browser asks first", () => {
    const response = corsPreflightResponse();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe("content-type, authorization");
    expect(Number(response.headers.get("access-control-max-age"))).toBeGreaterThan(0);
  });

  it("should drop a credentials header and keep the body when a response is wrapped", async () => {
    const wrapped = withCorsHeaders(new Response("{\"ok\":true}", { status: 400, headers: { "Access-Control-Allow-Credentials": "true", "Cache-Control": "no-store" } }));
    expect(wrapped.status).toBe(400);
    expect(wrapped.headers.get("access-control-allow-origin")).toBe("*");
    expect(wrapped.headers.get("access-control-allow-credentials")).toBeNull();
    expect(wrapped.headers.get("cache-control")).toBe("no-store");
    expect(await wrapped.text()).toBe("{\"ok\":true}");
  });
});

describe("withoutCookies", () => {
  it("should remove the session cookie and keep the body when a cross-origin token request carries one", async () => {
    const request = new Request("https://artifacts.space/api/auth/oauth2/token", {
      method: "POST",
      headers: { cookie: "better-auth.session_token=abc", origin: "https://client.example", "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=authorization_code&code=c&code_verifier=v",
    });
    const stripped = withoutCookies(request);
    expect(stripped.headers.get("cookie")).toBeNull();
    expect(stripped.headers.get("origin")).toBe("https://client.example");
    expect(await stripped.text()).toBe("grant_type=authorization_code&code=c&code_verifier=v");
  });
});
