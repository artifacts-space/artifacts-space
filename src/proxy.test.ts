import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canReadArtifact: vi.fn(),
  getSession: vi.fn(),
  getTeamForMember: vi.fn(),
  hitRateLimits: vi.fn(),
}));

vi.mock("@/lib/access", () => ({ canReadArtifact: mocks.canReadArtifact }));
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock("@/lib/teams/queries", () => ({ getTeamForMember: mocks.getTeamForMember }));
vi.mock("@/lib/abuse/rate-limit", () => ({
  hitRateLimits: mocks.hitRateLimits,
  rateLimitMessage: () => "Your network has opened a lot of artifact pages in the last hour. Try again in about 5 minutes.",
}));

const { config, proxy } = await import("./proxy");

const origin = "https://artifacts.space";
const sessionCookie = "better-auth.session_token=token.signature";

function request(path: string, options: { cookie?: string; method?: string; accept?: string } = {}) {
  const headers = new Headers({ ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.accept ? { accept: options.accept } : {}) });
  return new NextRequest(new URL(path, origin), { method: options.method ?? "GET", headers });
}

function location(response: Response) {
  return response.headers.get("location");
}

describe("proxy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.hitRateLimits.mockResolvedValue(null);
  });

  it("should redirect to sign-in with a return path when a workspace page is loaded signed out", async () => {
    for (const path of ["/app", "/app/connections", "/inbox", "/teams", "/teams/new"]) {
      const response = await proxy(request(path));
      expect(response.status).toBe(307);
      expect(location(response)).toBe(`${origin}/sign-in?next=${encodeURIComponent(path)}`);
    }
  });

  it("should keep the query in the return path when the page has one", async () => {
    const response = await proxy(request("/app?q=notes"));
    expect(location(response)).toBe(`${origin}/sign-in?next=${encodeURIComponent("/app?q=notes")}`);
  });

  it("should pass a workspace page through without a database call when the session cookie is present", async () => {
    const response = await proxy(request("/app", { cookie: sessionCookie }));
    expect(response.status).toBe(200);
    expect(location(response)).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("should accept the secure cookie name when the site runs on HTTPS", async () => {
    const response = await proxy(request("/inbox", { cookie: `__Secure-${sessionCookie}` }));
    expect(location(response)).toBeNull();
  });

  it("should redirect a comment thread to sign-in when it is loaded signed out", async () => {
    const response = await proxy(request("/threads/abc"));
    expect(response.status).toBe(307);
    expect(mocks.canReadArtifact).not.toHaveBeenCalled();
  });

  it("should still check the artifact when a signed-in viewer loads a comment thread", async () => {
    mocks.canReadArtifact.mockResolvedValue(false);
    const response = await proxy(request("/threads/abc", { cookie: sessionCookie }));
    expect(response.status).toBe(404);
  });

  it("should leave artifact pages open when the viewer is signed out", async () => {
    mocks.canReadArtifact.mockResolvedValue(true);
    const response = await proxy(request("/artifact/abc"));
    expect(response.status).toBe(200);
    expect(location(response)).toBeNull();
  });

  it("should answer 429 with Retry-After when a network opens too many artifact pages", async () => {
    mocks.hitRateLimits.mockResolvedValue({ name: "artifactPageByNetwork", retryAfterSeconds: 300 });
    const response = await proxy(request("/artifact/abc"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("300");
    await expect(response.text()).resolves.toContain("Try again");
    expect(mocks.canReadArtifact).not.toHaveBeenCalled();
  });

  it("should count artifact page views per network and leave other pages uncounted", async () => {
    mocks.canReadArtifact.mockResolvedValue(true);
    await proxy(request("/artifact/abc"));
    expect(mocks.hitRateLimits).toHaveBeenCalledWith([{ name: "artifactPageByNetwork", subject: expect.stringMatching(/^[a-f0-9]{32}$/) as unknown }]);
    mocks.hitRateLimits.mockClear();
    await proxy(request("/app", { cookie: sessionCookie }));
    expect(mocks.hitRateLimits).not.toHaveBeenCalled();
  });

  it("should still serve the page when the rate limit check fails", async () => {
    mocks.hitRateLimits.mockRejectedValue(new Error("down"));
    mocks.canReadArtifact.mockResolvedValue(true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await proxy(request("/artifact/abc"));
    expect(response.status).toBe(200);
  });

  it("should rewrite to the Markdown handler without its own checks when the path ends in .md", async () => {
    const response = await proxy(request("/artifact/abc.md?comments=1"));
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${origin}/artifact/abc/markdown?comments=1`);
    // The handler runs the access check and rate limits, with bearer tokens too.
    expect(mocks.canReadArtifact).not.toHaveBeenCalled();
    expect(mocks.hitRateLimits).not.toHaveBeenCalled();
  });

  it("should rewrite to the Markdown handler when the Accept header asks for Markdown", async () => {
    const response = await proxy(request("/artifact/abc", { accept: "text/markdown" }));
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${origin}/artifact/abc/markdown`);
  });

  it("should serve the normal page when a browser loads the artifact", async () => {
    mocks.canReadArtifact.mockResolvedValue(true);
    const response = await proxy(request("/artifact/abc", { accept: "text/html,application/xhtml+xml,*/*;q=0.8" }));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(mocks.canReadArtifact).toHaveBeenCalled();
  });

  it("should pass server actions through when the request is a POST", async () => {
    const response = await proxy(request("/app", { method: "POST" }));
    expect(location(response)).toBeNull();
  });

  it("should not run on auth, API, or invitation routes", () => {
    const patterns = config.matcher.join(" ");
    for (const prefix of ["/api", "/sign-in", "/sign-up", "/invitations", "/share"]) {
      expect(patterns).not.toContain(prefix);
    }
  });
});
