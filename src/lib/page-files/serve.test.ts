import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hitRateLimits: vi.fn(), findPageFile: vi.fn(), openObject: vi.fn() }));

vi.mock("@/lib/abuse/rate-limit", () => ({ hitRateLimits: mocks.hitRateLimits, rateLimitMessage: () => "Too many requests." }));
vi.mock("./store", () => ({ findPageFile: mocks.findPageFile }));
vi.mock("@/lib/files/r2", () => ({ openObject: mocks.openObject, r2ConfigFromEnv: () => ({}) }));

const { pageFileResponse } = await import("./serve");
const { mintPageToken } = await import("./token");

const secret = "unit-test-secret-0123456789-abcdefghijklmnop";
const label = "0123456789abcdef0123456789abcdef";
const otherLabel = "fedcba9876543210fedcba9876543210";
const now = new Date("2026-11-17T12:02:00.000Z");
const host = `${label}.artifacts.link`;

function tokenFor(grant: { label?: string; asOf?: Date | null; artifactId?: string } = {}, at: Date = now) {
  return mintPageToken({ artifactId: grant.artifactId ?? "artifact-1", label: grant.label ?? label, asOf: grant.asOf ?? null, stamp: 1 }, at, secret).token;
}

function ask(input: { token?: string; path?: string; host?: string | null; method?: "GET" | "HEAD"; range?: string; at?: Date } = {}) {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.7", ...(input.range ? { range: input.range } : {}) });
  return pageFileResponse({ method: input.method ?? "GET", host: input.host === undefined ? host : input.host, headers, token: input.token ?? tokenFor(), segments: (input.path ?? "css/site.css").split("/") }, input.at ?? now);
}

const stored = { key: "files/abc/site.css", contentType: "text/css", size: 12 };
const body = () => new Blob(["body { } \n\n\n"]).stream();

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PAGE_HOST", "artifacts.link");
  vi.stubEnv("BETTER_AUTH_URL", "https://artifacts.space");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  mocks.hitRateLimits.mockResolvedValue(null);
  mocks.findPageFile.mockResolvedValue(stored);
  mocks.openObject.mockImplementation(() => Promise.resolve({ state: "open", object: { status: 200, body: body(), length: 12, contentRange: null } }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("pageFileResponse", () => {
  it("should stream the file with its own type and the page's policy when the token opens on this page host", async () => {
    const response = await ask();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(response.headers.get("content-length")).toBe("12");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors https://artifacts.space");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("cache-control")).toMatch(/^private, max-age=\d+$/);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe("body { } \n\n\n");
    expect(mocks.findPageFile).toHaveBeenCalledWith("artifact-1", "css/site.css", null);
    expect(mocks.openObject).toHaveBeenCalledWith({}, "files/abc/site.css", { range: null, head: false });
  });

  it("should look the file up as the version the token is for had it", async () => {
    const asOf = new Date("2026-11-01T00:00:00.000Z");
    await ask({ token: tokenFor({ asOf }) });
    expect(mocks.findPageFile).toHaveBeenCalledWith("artifact-1", "css/site.css", asOf);
  });

  it.each([
    ["a token made for another artifact's page host", () => ({ token: tokenFor({ label: otherLabel }) })],
    ["a token that has ended", () => ({ token: tokenFor({}, new Date(now.getTime() - 20 * 60_000)) })],
    ["a token with a changed character", () => ({ token: `${tokenFor().slice(0, 30)}${tokenFor()[30] === "A" ? "B" : "A"}${tokenFor().slice(31)}` })],
    ["text that is not a token", () => ({ token: "x".repeat(120) })],
    ["a token made under another secret", () => ({ token: mintPageToken({ artifactId: "artifact-1", label, asOf: null, stamp: 1 }, now, "another-secret-0123456789-abcdefghijklmnop").token })],
  ])("should answer 404 for %s, and read nothing", async (_name, input) => {
    const response = await ask(input());
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.hitRateLimits).not.toHaveBeenCalled();
    expect(mocks.findPageFile).not.toHaveBeenCalled();
    expect(mocks.openObject).not.toHaveBeenCalled();
  });

  it.each(["artifacts.space", "www.artifacts.link", "artifacts.link", `${label}.example.com`, `${label}.x.artifacts.link`, null])("should answer 404 on the host %s, which is no page host of this deployment, even with a good token", async (wrongHost) => {
    const response = await ask({ host: wrongHost });
    expect(response.status).toBe(404);
    expect(mocks.hitRateLimits).not.toHaveBeenCalled();
    expect(mocks.findPageFile).not.toHaveBeenCalled();
  });

  it("should answer 404 everywhere when no page domain is set", async () => {
    vi.stubEnv("PAGE_HOST", "");
    expect((await ask()).status).toBe(404);
    expect(mocks.findPageFile).not.toHaveBeenCalled();
  });

  it.each(["../secret.css", "css/../../x.css", "index.html", "css/%2e%2e/x.css", ".env", "a.php"])("should answer 404 for the path %s without a lookup", async (path) => {
    expect((await ask({ path })).status).toBe(404);
    expect(mocks.findPageFile).not.toHaveBeenCalled();
  });

  it("should count the network's limit only once the token opened, and before the lookup", async () => {
    mocks.hitRateLimits.mockResolvedValue({ name: "pageFileByNetwork", retryAfterSeconds: 30 });
    const response = await ask();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(mocks.hitRateLimits).toHaveBeenCalledTimes(1);
    expect(mocks.hitRateLimits.mock.calls[0]?.[0]).toMatchObject([{ name: "pageFileByNetwork" }]);
    expect(mocks.findPageFile).not.toHaveBeenCalled();
  });

  it("should still serve when the limit's counter cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.hitRateLimits.mockRejectedValue(new Error("down"));
    expect((await ask()).status).toBe(200);
  });

  it("should answer 404 when the artifact has no such file, or its bytes are gone", async () => {
    mocks.findPageFile.mockResolvedValueOnce(null);
    expect((await ask()).status).toBe(404);
    mocks.openObject.mockResolvedValueOnce({ state: "missing" });
    expect((await ask()).status).toBe(404);
  });

  it("should pass one checked Range on and answer with the part", async () => {
    mocks.openObject.mockResolvedValueOnce({ state: "open", object: { status: 206, body: body(), length: 4, contentRange: "bytes 0-3/12" } });
    const response = await ask({ range: "bytes=0-3" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-3/12");
    expect(mocks.openObject).toHaveBeenCalledWith({}, "files/abc/site.css", { range: "bytes=0-3", head: false });
  });

  it("should not pass on a Range it cannot read, and say so when storage cannot satisfy one", async () => {
    await ask({ range: "bytes=0-1,4-5" });
    expect(mocks.openObject).toHaveBeenLastCalledWith({}, "files/abc/site.css", { range: null, head: false });
    mocks.openObject.mockResolvedValueOnce({ state: "bad-range" });
    const response = await ask({ range: "bytes=500-" });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */12");
  });

  it("should answer a HEAD with the headers and no body", async () => {
    mocks.openObject.mockResolvedValueOnce({ state: "open", object: { status: 200, body: null, length: 12, contentRange: null } });
    const response = await ask({ method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("12");
    expect(await response.text()).toBe("");
  });

  it("should answer 500 without a word of the cause when storage fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.openObject.mockRejectedValueOnce(new Error("signed-url-with-secret"));
    const response = await ask();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("secret");
  });

  it("should never serve the development fixture's files outside next dev", async () => {
    mocks.findPageFile.mockResolvedValueOnce(null);
    const response = await ask({ token: tokenFor({ artifactId: "fixture:page-files" }), path: "data.json" });
    expect(response.status).toBe(404);
    expect(mocks.findPageFile).toHaveBeenCalledWith("fixture:page-files", "data.json", null);
  });
});
