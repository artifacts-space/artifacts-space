import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Password sign-in limits on the auth route, with Better Auth and the
 * Postgres counters mocked at their boundary: every try is counted by
 * network and by address before Better Auth sees it, a refusal never reaches
 * Better Auth and reads the same for every address, form posts are refused,
 * and a counter failure refuses rather than letting guesses through.
 */

const mocks = vi.hoisted(() => ({ handler: vi.fn<(request: Request) => Promise<Response>>(), hitRateLimits: vi.fn<(checks: readonly { name: string; subject: string }[]) => Promise<unknown>>() }));

vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ handler: mocks.handler }) }));
vi.mock("@/lib/abuse/rate-limit", () => ({ hitRateLimit: vi.fn(), hitRateLimits: mocks.hitRateLimits, rateLimitMessage: () => "Slow down." }));
vi.mock("@/lib/oauth/clients", () => ({ countUnapprovedClients: () => Promise.resolve(0) }));

const { POST } = await import("./route");

const site = "https://artifacts.space";

function signIn(email: string, contentType = "application/json") {
  const body = contentType === "application/json" ? JSON.stringify({ email, password: "a-password" }) : `email=${encodeURIComponent(email)}&password=a-password`;
  return new Request(`${site}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": contentType, "x-forwarded-for": "203.0.113.9" }, body });
}

describe("auth route password sign-in", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
    mocks.handler.mockImplementation(() => Promise.resolve(Response.json({ code: "INVALID_EMAIL_OR_PASSWORD" }, { status: 401 })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should count the try by network and by address before Better Auth sees it", async () => {
    mocks.hitRateLimits.mockResolvedValue(null);
    const response = await POST(signIn("Ada@Example.com"));
    expect(response.status).toBe(401);
    const checks = mocks.hitRateLimits.mock.lastCall?.[0] ?? [];
    expect(checks.map((check) => check.name)).toEqual(["passwordSignInByNetwork", "passwordSignInByNetworkDay", "passwordSignInByEmail", "passwordSignInByEmailDay"]);
    expect(JSON.stringify(checks)).not.toContain("ada");
    expect(JSON.stringify(checks)).not.toContain("203.0.113.9");
    expect(mocks.handler).toHaveBeenCalledOnce();
  });

  it("should refuse with 429 and never check the password when a limit refuses", async () => {
    mocks.hitRateLimits.mockResolvedValue({ name: "passwordSignInByEmail", retryAfterSeconds: 120 });
    const response = await POST(signIn("reviewer@artifacts.space"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "RATE_LIMITED", message: "Slow down." });
    expect(mocks.handler).not.toHaveBeenCalled();
  });

  it("should give the same refusal for an address with an account and one without", async () => {
    mocks.hitRateLimits.mockResolvedValue({ name: "passwordSignInByNetwork", retryAfterSeconds: 60 });
    const answers = await Promise.all(["reviewer@artifacts.space", "nobody@example.com"].map(async (email) => {
      const response = await POST(signIn(email));
      return { status: response.status, body: await response.text(), retryAfter: response.headers.get("retry-after") };
    }));
    expect(answers[0]).toEqual(answers[1]);
  });

  it("should refuse a form post so the per-address limit cannot be skipped", async () => {
    const response = await POST(signIn("reviewer@artifacts.space", "application/x-www-form-urlencoded"));
    expect(response.status).toBe(415);
    expect(mocks.hitRateLimits).not.toHaveBeenCalled();
    expect(mocks.handler).not.toHaveBeenCalled();
  });

  it("should refuse rather than let the try through when the counters fail", async () => {
    mocks.hitRateLimits.mockRejectedValue(new Error("database down"));
    const response = await POST(signIn("reviewer@artifacts.space"));
    expect(response.status).toBe(503);
    expect(mocks.handler).not.toHaveBeenCalled();
  });
});
