import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The auth route with Better Auth mocked at its boundary: which requests get
 * CORS headers, and that no cookie reaches the token and revoke endpoints.
 * The PKCE check itself is Better Auth's (a code is refused without its
 * verifier); it needs a database, so it is not exercised here.
 */

const mocks = vi.hoisted(() => ({
  handler: vi.fn<(request: Request) => Promise<Response>>(),
  hitRateLimit: vi.fn(),
  hitRateLimits: vi.fn<(checks: readonly { name: string; subject: string }[]) => Promise<unknown>>(),
  peekRateLimit: vi.fn(),
  countRateLimitHit: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ handler: mocks.handler }) }));
vi.mock("@/lib/abuse/rate-limit", () => ({
  hitRateLimit: mocks.hitRateLimit,
  hitRateLimits: mocks.hitRateLimits,
  peekRateLimit: mocks.peekRateLimit,
  countRateLimitHit: mocks.countRateLimitHit,
  rateLimitMessage: () => "Slow down.",
}));
vi.mock("@/lib/oauth/limit-store", () => ({
  findRefreshGrant: () => Promise.resolve(null),
  unapprovedClientCounts: () => Promise.resolve({ total: 0, fromNetwork: 0, oldestFromNetwork: null }),
  markClientNetwork: () => Promise.resolve(),
}));

const { OPTIONS, POST } = await import("./route");

const site = "https://artifacts.space";

function post(path: string, headers: Record<string, string> = {}) {
  return new Request(`${site}${path}`, {
    method: "POST",
    headers: { origin: "https://client.example", "content-type": "application/x-www-form-urlencoded", cookie: "better-auth.session_token=abc", ...headers },
    body: "grant_type=authorization_code&code=c&code_verifier=v&client_id=x",
  });
}

describe("auth route CORS", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
    mocks.hitRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.peekRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.countRateLimitHit.mockResolvedValue(undefined);
    mocks.handler.mockImplementation(() => Promise.resolve(Response.json({ access_token: "t" }, { headers: { "Access-Control-Allow-Credentials": "true" } })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should answer a cross-origin token exchange for any origin without credentials when a browser client calls it", async () => {
    const response = await POST(post("/api/auth/oauth2/token"));
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(await response.json()).toEqual({ access_token: "t" });
  });

  it("should never pass a cookie to Better Auth when the token or revoke endpoint is called", async () => {
    for (const path of ["/api/auth/oauth2/token", "/api/auth/oauth2/revoke"]) {
      await POST(post(path));
      const forwarded = mocks.handler.mock.lastCall?.[0];
      expect(forwarded).toBeInstanceOf(Request);
      expect(forwarded?.headers.get("cookie")).toBeNull();
    }
  });

  it("should forward the code and verifier unchanged when the cookie is removed", async () => {
    await POST(post("/api/auth/oauth2/token"));
    const forwarded = mocks.handler.mock.lastCall?.[0];
    expect(await forwarded?.text()).toBe("grant_type=authorization_code&code=c&code_verifier=v&client_id=x");
  });

  it("should keep introspection and session endpoints closed to other origins when they are called", async () => {
    mocks.handler.mockImplementation(() => Promise.resolve(Response.json({ active: false })));
    for (const path of ["/api/auth/oauth2/introspect", "/api/auth/get-session"]) {
      const response = await POST(post(path));
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  it("should send the CORS headers on a rate-limit refusal so the client can read it", async () => {
    mocks.hitRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const response = await POST(post("/api/auth/oauth2/token"));
    expect(response.status).toBe(429);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(mocks.handler).not.toHaveBeenCalled();
  });

  it("should answer the preflight only for the token and revoke endpoints", () => {
    const token = OPTIONS(new Request(`${site}/api/auth/oauth2/token`, { method: "OPTIONS" }));
    expect(token.status).toBe(204);
    expect(token.headers.get("access-control-allow-origin")).toBe("*");
    const introspect = OPTIONS(new Request(`${site}/api/auth/oauth2/introspect`, { method: "OPTIONS" }));
    expect(introspect.status).toBe(204);
    expect(introspect.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("auth route sign-in links", () => {
  function signIn(email: string) {
    return new Request(`${site}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
      body: JSON.stringify({ email, callbackURL: `${site}/app` }),
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
    mocks.handler.mockImplementation(() => Promise.resolve(Response.json({ status: true })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should check the burst limits by network and by address when a link is asked for", async () => {
    mocks.hitRateLimits.mockResolvedValue(null);
    const response = await POST(signIn("Ada@Example.com"));
    expect(response.status).toBe(200);
    const checks = mocks.hitRateLimits.mock.lastCall?.[0] ?? [];
    expect(checks.map((check) => check.name)).toEqual(["magicLinkByNetworkMinute", "magicLinkByNetwork", "magicLinkByNetworkDay", "magicLinkByEmailMinute", "magicLinkByEmail"]);
    expect(JSON.stringify(checks)).not.toContain("ada");
    expect(JSON.stringify(checks)).not.toContain("203.0.113.7");
    expect(mocks.handler).toHaveBeenCalledOnce();
  });

  it("should refuse with 429 and never send the link when a limit refuses", async () => {
    mocks.hitRateLimits.mockResolvedValue({ name: "magicLinkByNetworkMinute", retryAfterSeconds: 42 });
    const response = await POST(signIn("probe3@example.net"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "RATE_LIMITED", message: "Slow down." });
    expect(mocks.handler).not.toHaveBeenCalled();
  });

  it("should give the same refusal for every address when the network is over its limit", async () => {
    mocks.hitRateLimits.mockResolvedValue({ name: "magicLinkByNetworkMinute", retryAfterSeconds: 42 });
    const answers = await Promise.all(["member@example.com", "nobody@example.com"].map(async (email) => {
      const response = await POST(signIn(email));
      return { status: response.status, body: await response.text(), retryAfter: response.headers.get("retry-after") };
    }));
    expect(answers[0]).toEqual(answers[1]);
    expect(mocks.handler).not.toHaveBeenCalled();
  });
});
