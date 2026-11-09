import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canReadArtifact: vi.fn(),
  checkArtifactPage: vi.fn(),
  getSession: vi.fn(),
  getTeamForMember: vi.fn(),
  hitRateLimits: vi.fn(),
}));

vi.mock("@/lib/access", () => ({ canReadArtifact: mocks.canReadArtifact }));
vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock("@/lib/teams/queries", () => ({ getTeamForMember: mocks.getTeamForMember }));
vi.mock("@/lib/artifact-page-check", () => ({ checkArtifactPage: mocks.checkArtifactPage }));
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

/** Better Auth's getSession answer with `returnHeaders`, for a live session. */
function signedIn(setCookies: string[] = []) {
  const headers = new Headers();
  for (const value of setCookies) headers.append("set-cookie", value);
  mocks.getSession.mockResolvedValue({ headers, response: { user: { id: "user-1" }, session: {} } });
}

/** Better Auth's getSession answer with `returnHeaders`, for a stale cookie. */
function signedOut() {
  mocks.getSession.mockResolvedValue({ headers: new Headers(), response: null });
}

/** What checkArtifactPage answers. */
function page(readable: boolean, indexable = false) {
  return { readable, indexable };
}

function location(response: Response) {
  return response.headers.get("location");
}

describe("proxy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Network keys need a secret to hash with (src/lib/abuse/network-key.ts).
    vi.stubEnv("BETTER_AUTH_SECRET", "test-network-key-secret");
    mocks.hitRateLimits.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("should pass a workspace page through when the session is live", async () => {
    signedIn();
    const response = await proxy(request("/app", { cookie: sessionCookie }));
    expect(response.status).toBe(200);
    expect(location(response)).toBeNull();
  });

  it("should forward Better Auth's refreshed cookies when the session is renewed", async () => {
    signedIn(["better-auth.session_token=renewed; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax"]);
    const response = await proxy(request("/app", { cookie: sessionCookie }));
    expect(response.headers.getSetCookie()).toEqual(["better-auth.session_token=renewed; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax"]);
  });

  it("should accept the secure cookie name when the site runs on HTTPS", async () => {
    signedIn();
    const response = await proxy(request("/inbox", { cookie: `__Secure-${sessionCookie}` }));
    expect(location(response)).toBeNull();
  });

  it("should send a stale cookie to sign-in and expire it when the session is gone", async () => {
    signedOut();
    const response = await proxy(request("/app", { cookie: `__Secure-${sessionCookie}; __Secure-better-auth.session_data=cache; theme=dark` }));
    expect(response.status).toBe(307);
    expect(location(response)).toBe(`${origin}/sign-in?next=%2Fapp`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const cleared = response.headers.getSetCookie();
    expect(cleared).toHaveLength(2);
    for (const cookie of cleared) {
      expect(cookie).toMatch(/^__Secure-better-auth\.session_(token|data)=;/);
      expect(cookie).toMatch(/Max-Age=0/);
      expect(cookie).toMatch(/Secure/);
    }
  });

  it("should still serve a workspace page when the session check fails", async () => {
    mocks.getSession.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await proxy(request("/app", { cookie: sessionCookie }));
    expect(response.status).toBe(200);
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
    mocks.checkArtifactPage.mockResolvedValue(page(true));
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
    expect(mocks.checkArtifactPage).not.toHaveBeenCalled();
  });

  it("should count artifact page views per network and leave other pages uncounted", async () => {
    mocks.checkArtifactPage.mockResolvedValue(page(true));
    await proxy(request("/artifact/abc"));
    expect(mocks.hitRateLimits).toHaveBeenCalledWith([{ name: "artifactPageByNetwork", subject: expect.stringMatching(/^[a-f0-9]{32}$/) as unknown }]);
    mocks.hitRateLimits.mockClear();
    signedIn();
    await proxy(request("/app", { cookie: sessionCookie }));
    expect(mocks.hitRateLimits).not.toHaveBeenCalled();
  });

  it("should still serve the page when the rate limit check fails", async () => {
    mocks.hitRateLimits.mockRejectedValue(new Error("down"));
    mocks.checkArtifactPage.mockResolvedValue(page(true));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await proxy(request("/artifact/abc"));
    expect(response.status).toBe(200);
  });

  it("should rewrite to the Markdown handler without its own checks when the path ends in .md", async () => {
    const response = await proxy(request("/artifact/abc.md?comments=1"));
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${origin}/artifact/abc/markdown?comments=1`);
    // The handler runs the access check and rate limits, with bearer tokens too.
    expect(mocks.checkArtifactPage).not.toHaveBeenCalled();
    expect(mocks.hitRateLimits).not.toHaveBeenCalled();
  });

  it("should rewrite to the Markdown handler when the Accept header asks for Markdown", async () => {
    const response = await proxy(request("/artifact/abc", { accept: "text/markdown" }));
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${origin}/artifact/abc/markdown`);
  });

  it("should serve the normal page when a browser loads the artifact", async () => {
    mocks.checkArtifactPage.mockResolvedValue(page(true));
    const response = await proxy(request("/artifact/abc", { accept: "text/html,application/xhtml+xml,*/*;q=0.8" }));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(mocks.checkArtifactPage).toHaveBeenCalledWith("abc", expect.any(Function));
    expect(mocks.canReadArtifact).not.toHaveBeenCalled();
  });

  it("should pass server actions through when the request is a POST", async () => {
    const response = await proxy(request("/app", { method: "POST" }));
    expect(location(response)).toBeNull();
  });

  it("should send noindex, nofollow when a readable artifact page may not be indexed", async () => {
    mocks.checkArtifactPage.mockResolvedValue(page(true, false));
    const response = await proxy(request("/artifact/abc"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("should send no X-Robots-Tag when the author opted a public artifact into search engines", async () => {
    mocks.checkArtifactPage.mockResolvedValue(page(true, true));
    const response = await proxy(request("/artifact/abc"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });

  it("should send noindex, nofollow on the 404 when the viewer cannot read the artifact", async () => {
    mocks.checkArtifactPage.mockResolvedValue(page(false, true));
    const response = await proxy(request("/artifact/abc"));
    expect(response.status).toBe(404);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("should stay noindex when the page check fails", async () => {
    mocks.checkArtifactPage.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await proxy(request("/artifact/abc"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("should not run on API, invitation, or share routes", () => {
    const patterns = config.matcher.map((entry) => (typeof entry === "string" ? entry : entry.source)).join(" ");
    for (const prefix of ["/api", "/invitations", "/share", "/docs"]) {
      expect(patterns).not.toContain(prefix);
    }
  });

  it("should run on the landing and sign-in pages only when a session cookie is present", () => {
    const entries = config.matcher.filter((entry) => typeof entry !== "string");
    expect(entries.map((entry) => entry.source).sort()).toEqual(["/", "/", "/sign-in", "/sign-in", "/sign-up", "/sign-up"]);
    for (const entry of entries) {
      expect(entry.has).toHaveLength(1);
      expect(["__Secure-better-auth.session_token", "better-auth.session_token"]).toContain(entry.has[0]?.key);
    }
  });
});

describe("proxy on the landing and sign-in pages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should send a visitor with a session cookie from / to the workspace without a session lookup", async () => {
    for (const cookie of [sessionCookie, `__Secure-${sessionCookie}`]) {
      const response = await proxy(request("/", { cookie }));
      expect(response.status).toBe(307);
      expect(location(response)).toBe(`${origin}/app`);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("should serve the static landing page untouched when there is no session cookie", async () => {
    const response = await proxy(request("/"));
    expect(response.status).toBe(200);
    expect(location(response)).toBeNull();
    expect(response.headers.get("cache-control")).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("should serve the landing page to a signed-in visitor when the URL is /?home", async () => {
    const response = await proxy(request("/?home", { cookie: sessionCookie }));
    expect(response.status).toBe(200);
    expect(location(response)).toBeNull();
  });

  it("should send a signed-in person from the sign-in pages to the workspace or next", async () => {
    signedIn();
    for (const path of ["/sign-in", "/sign-up"]) {
      const response = await proxy(request(path, { cookie: sessionCookie }));
      expect(location(response)).toBe(`${origin}/app`);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    const next = await proxy(request(`/sign-in?next=${encodeURIComponent("/teams/acme")}`, { cookie: sessionCookie }));
    expect(location(next)).toBe(`${origin}/teams/acme`);
  });

  it("should never follow a next path off the site when a signed-in person loads sign-in", async () => {
    signedIn();
    const response = await proxy(request(`/sign-in?next=${encodeURIComponent("//evil.example")}`, { cookie: sessionCookie }));
    expect(location(response)).toBe(`${origin}/app`);
  });

  it("should show the sign-in page and expire the cookie when the cookie is stale", async () => {
    signedOut();
    const response = await proxy(request("/sign-in?next=%2Fapp", { cookie: sessionCookie }));
    expect(response.status).toBe(200);
    expect(location(response)).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.getSetCookie()).toEqual([expect.stringMatching(/^better-auth\.session_token=;.*Max-Age=0/) as unknown]);
  });

  it("should show the sign-in page when the session check fails", async () => {
    mocks.getSession.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await proxy(request("/sign-in", { cookie: sessionCookie }));
    expect(response.status).toBe(200);
    expect(location(response)).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
