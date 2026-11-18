import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkArtifactPage: vi.fn(),
  getSession: vi.fn(),
  getTeamForMember: vi.fn(),
  hitRateLimits: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock("@/lib/teams/queries", () => ({ getTeamForMember: mocks.getTeamForMember }));
vi.mock("@/lib/artifact-page-check", () => ({ checkArtifactPage: mocks.checkArtifactPage }));
vi.mock("@/lib/abuse/rate-limit", () => ({
  hitRateLimits: mocks.hitRateLimits,
  rateLimitMessage: () => "Your network has opened a lot of artifact pages in the last hour. Try again in about 5 minutes.",
}));

const { config, proxy } = await import("./proxy");
const { pageHostPattern } = await import("./lib/security-header-rules");

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

  it("should redirect an old thread link to the artifact's comments in the workspace when a signed-in viewer opens it", async () => {
    const response = await proxy(request("/threads/abc", { cookie: sessionCookie }));
    expect(response.status).toBe(307);
    expect(location(response)).toBe(`${origin}/app?artifact=abc&comments=1`);
  });

  it("should redirect an old thread link the same way without any lookup when the visitor is signed out", async () => {
    const response = await proxy(request("/threads/abc"));
    expect(response.status).toBe(307);
    expect(location(response)).toBe(`${origin}/app?artifact=abc&comments=1`);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.checkArtifactPage).not.toHaveBeenCalled();
  });

  it("should keep an odd id inside the redirect's query when an old thread link carries one", async () => {
    const response = await proxy(request("/threads/a%26b%3Dc"));
    expect(location(response)).toBe(`${origin}/app?artifact=a%26b%3Dc&comments=1`);
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
    const cookies = config.matcher.flatMap((entry) => (typeof entry === "string" ? [] : entry.has.flatMap((condition) => ("key" in condition ? [{ source: entry.source, key: condition.key, conditions: entry.has.length }] : []))));
    expect(cookies.map((entry) => entry.source).sort()).toEqual(["/", "/", "/sign-in", "/sign-in", "/sign-up", "/sign-up"]);
    for (const entry of cookies) {
      expect(entry.conditions).toBe(1);
      expect(["__Secure-better-auth.session_token", "better-auth.session_token"]).toContain(entry.key);
    }
  });

  it("should run on every path of a page host, with the same host pattern as the header rules", () => {
    const hosts = config.matcher.flatMap((entry) => (typeof entry === "string" ? [] : entry.has.flatMap((condition) => ("value" in condition ? [{ source: entry.source, type: condition.type, value: condition.value }] : []))));
    expect(hosts).toEqual([{ source: "/:path*", type: "host", value: pageHostPattern }]);
  });
});

describe("proxy on a page host", () => {
  const label = "0123456789abcdef0123456789abcdef";

  function onHost(host: string, path: string, method = "GET", headers: Record<string, string> = {}) {
    return new NextRequest(new URL(path, `https://${host}`), { method, headers: new Headers({ host, ...headers }) });
  }

  beforeEach(() => {
    vi.stubEnv("PAGE_HOST", "artifacts.link");
    vi.stubEnv("BETTER_AUTH_URL", origin);
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it("should answer with the frame document, framed by the site only, when the page host's root is asked for", async () => {
    const response = await proxy(onHost(`${label}.artifacts.link`, "/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(`frame-ancestors ${origin}`);
    expect(response.headers.get("x-frame-options")).toBeNull();
    expect(await response.text()).toContain("artifact-page:ready");
  });

  it.each(["/app", "/sign-in", "/api/auth/get-session", "/artifact/abc", "/mcp", "/_next/static/chunk.js"])("should answer 404 for %s and never run the site's checks", async (path) => {
    const response = await proxy(onHost(`${label}.artifacts.link`, path, "GET"));
    expect(response.status).toBe(404);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.checkArtifactPage).not.toHaveBeenCalled();
  });

  it("should let a page file's path through to its route on a page host, and answer every other method there itself", async () => {
    const path = `/f/${"t".repeat(120)}/css/site.css`;
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(onHost(`${label}.artifacts.link`, path, method));
      expect(response.headers.get("x-middleware-next"), method).toBe("1");
    }
    expect((await proxy(onHost(`${label}.artifacts.link`, path, "POST"))).status).toBe(405);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.checkArtifactPage).not.toHaveBeenCalled();
  });

  it("should serve the frame document as the page's name under a files address", async () => {
    const response = await proxy(onHost(`${label}.artifacts.link`, `/f/${"t".repeat(120)}/index.html`));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("artifact-page:ready");
  });

  it("should answer another page of the site with the frame document, whatever query or hash the address carries", async () => {
    const root = await proxy(onHost(`${label}.artifacts.link`, "/"));
    for (const path of [`/f/${"t".repeat(120)}/about.html`, `/f/${"t".repeat(120)}/about.html?tab=2#top`, `/f/${"t".repeat(120)}/docs/guide.html?x=<b>`]) {
      const response = await proxy(onHost(`${label}.artifacts.link`, path));
      expect(response.status, path).toBe(200);
      expect(response.headers.get("x-middleware-next"), path).toBeNull();
      expect(response.headers.get("content-security-policy")).toBe(root.headers.get("content-security-policy"));
      expect(response.headers.get("vary")).toBe("X-Page-Source");
      expect(await response.text()).toContain("artifact-page:opened");
    }
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("should let the frame document's fetch of a page's source through to its route, and nothing that navigates", async () => {
    const path = `/f/${"t".repeat(120)}/about.html?tab=2`;
    const fetched = await proxy(onHost(`${label}.artifacts.link`, path, "GET", { "x-page-source": "1", "sec-fetch-dest": "empty", "sec-fetch-site": "same-origin" }));
    expect(fetched.headers.get("x-middleware-next")).toBe("1");
    const navigated = await proxy(onHost(`${label}.artifacts.link`, path, "GET", { "x-page-source": "1", "sec-fetch-dest": "iframe" }));
    expect(navigated.headers.get("x-middleware-next")).toBeNull();
    expect(navigated.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect((await proxy(onHost(`www.artifacts.link`, path, "GET", { "x-page-source": "1" }))).status).toBe(404);
  });

  it.each(["www.artifacts.link", "app.artifacts.link", `${label}.x.artifacts.link`])("should answer 404 on %s, a host under the page domain that is no page host, and never run the site's checks", async (host) => {
    for (const path of ["/", "/app", "/sign-in", "/artifact/abc", `/f/${"t".repeat(120)}/css/site.css`]) {
      const response = await proxy(onHost(host, path));
      expect(response.status, path).toBe(404);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.checkArtifactPage).not.toHaveBeenCalled();
  });

  it("should not refuse the site's own host or a look-alike of the page domain", async () => {
    for (const host of ["artifacts.space", "notartifacts.link", "artifacts.link.example.com"]) {
      const response = await proxy(onHost(host, "/app"));
      expect(response.status, host).not.toBe(404);
    }
  });

  it("should answer 404 for a host that looks like a page host on another domain", async () => {
    const response = await proxy(onHost(`${label}.example.com`, "/"));
    expect(response.status).toBe(404);
  });

  it("should answer 404 on every page host when no page domain is set", async () => {
    vi.stubEnv("PAGE_HOST", "");
    const response = await proxy(onHost(`${label}.artifacts.link`, "/"));
    expect(response.status).toBe(404);
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

  it("should end a stale cookie on sign-in with no loop when the real proxy is followed hop by hop", async () => {
    signedOut();
    for (const start of ["/", "/sign-in", "/sign-up", "/app"]) {
      let cookie: string | null = `__Secure-${sessionCookie}`;
      let path = start;
      const visited: string[] = [];
      for (;;) {
        expect(visited.length, `${start}: ${visited.join(" -> ")}`).toBeLessThan(5);
        visited.push(path);
        const response = await proxy(request(path, cookie ? { cookie } : {}));
        if (response.headers.getSetCookie().some((value) => value.includes("Max-Age=0"))) cookie = null;
        const next = location(response);
        if (!next) break;
        path = next.replace(origin, "");
      }
      expect(cookie, start).toBeNull();
      // With the cookie gone, / is the static landing page.
      expect(location(await proxy(request("/")))).toBeNull();
    }
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
