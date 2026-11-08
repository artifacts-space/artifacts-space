import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RateLimitCheck, RateLimitRefusal } from "@/lib/abuse/rate-limit";

import type { CountedView } from "./record-view";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getArtifactAccess: vi.fn(),
  hitRateLimits: vi.fn<(checks: readonly RateLimitCheck[]) => Promise<RateLimitRefusal | null>>(),
  recordView: vi.fn<(view: CountedView) => Promise<void>>(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/access", () => ({ getArtifactAccess: mocks.getArtifactAccess }));
vi.mock("@/lib/abuse/rate-limit", () => ({ hitRateLimits: mocks.hitRateLimits }));
vi.mock("./record-view", () => ({ recordView: mocks.recordView }));

const { handleViewBeacon } = await import("./beacon");

const publicId = "AbCdEfGhJkLmNpQrStUvWx";
const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const now = new Date("2026-11-08T12:00:00Z");

function beacon(body: unknown = { id: publicId, referrer: "https://news.ycombinator.com/item?id=42" }, headers: Record<string, string> = {}) {
  return new Request("https://artifacts.space/api/views", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "user-agent": chrome, "sec-fetch-site": "same-origin", "x-forwarded-for": "203.0.113.7", ...headers },
  });
}

function access(visibility: string, canEdit: boolean) {
  return { record: { id: "artifact-1", visibility }, canEdit };
}

describe("handleViewBeacon", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
    mocks.getSession.mockResolvedValue(null);
    mocks.hitRateLimits.mockResolvedValue(null);
    mocks.getArtifactAccess.mockResolvedValue(access("public", false));
    mocks.recordView.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should count a signed-out reader of a public artifact with the referrer reduced to its domain", async () => {
    await expect(handleViewBeacon(beacon(), now)).resolves.toBe("counted");
    const [view] = mocks.recordView.mock.calls[0] ?? [];
    expect(view).toMatchObject({ artifactId: "artifact-1", day: "2026-11-08", referrer: "news.ycombinator.com" });
    expect(view?.visitor).toMatch(/^[a-f0-9]{32}$/);
  });

  it("should never store the address, user agent, or full referrer when it counts a view", async () => {
    await handleViewBeacon(beacon(), now);
    const stored = JSON.stringify(mocks.recordView.mock.calls);
    expect(stored).not.toContain("203.0.113.7");
    expect(stored).not.toContain("Chrome");
    expect(stored).not.toContain("item?id=42");
  });

  it("should check the signed-in reader against the artifact when a session exists", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "reader-1" } });
    await handleViewBeacon(beacon(), now);
    expect(mocks.getArtifactAccess).toHaveBeenCalledWith(publicId, "reader-1");
  });

  it("should not count the author or a team editor when they open the page", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "author-1" } });
    mocks.getArtifactAccess.mockResolvedValue(access("public", true));
    await expect(handleViewBeacon(beacon(), now)).resolves.toBe("ignored");
    expect(mocks.recordView).not.toHaveBeenCalled();
  });

  it("should not count a link, team, or private artifact when a beacon names one", async () => {
    for (const visibility of ["link", "team", "private"]) {
      mocks.getArtifactAccess.mockResolvedValue(access(visibility, false));
      await expect(handleViewBeacon(beacon(), now)).resolves.toBe("ignored");
    }
    expect(mocks.recordView).not.toHaveBeenCalled();
  });

  it("should not count an artifact the reader cannot read or that does not exist", async () => {
    mocks.getArtifactAccess.mockResolvedValue(null);
    await expect(handleViewBeacon(beacon(), now)).resolves.toBe("ignored");
    expect(mocks.recordView).not.toHaveBeenCalled();
  });

  it("should ignore bots without touching the database when the user agent is a bot", async () => {
    await expect(handleViewBeacon(beacon(undefined, { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }), now)).resolves.toBe("ignored");
    expect(mocks.hitRateLimits).not.toHaveBeenCalled();
    expect(mocks.recordView).not.toHaveBeenCalled();
  });

  it("should ignore a beacon when another site sent it", async () => {
    await expect(handleViewBeacon(beacon(undefined, { "sec-fetch-site": "cross-site" }), now)).resolves.toBe("ignored");
    expect(mocks.recordView).not.toHaveBeenCalled();
  });

  it("should ignore a beacon when the body is not valid", async () => {
    await expect(handleViewBeacon(beacon("{\"id\":\"nope\"}"), now)).resolves.toBe("ignored");
    expect(mocks.getArtifactAccess).not.toHaveBeenCalled();
  });

  it("should not count when the network is over its limit", async () => {
    mocks.hitRateLimits.mockResolvedValue({ name: "viewByNetwork", retryAfterSeconds: 60 });
    await expect(handleViewBeacon(beacon(), now)).resolves.toBe("limited");
    expect(mocks.recordView).not.toHaveBeenCalled();
  });

  it("should limit per network and per network on one artifact when it checks the limits", async () => {
    await handleViewBeacon(beacon(), now);
    const checks = mocks.hitRateLimits.mock.calls[0]?.[0] ?? [];
    expect(checks.map((check) => check.name)).toEqual(["viewByNetwork", "viewByNetworkArtifact"]);
    expect(checks[0]?.subject).toMatch(/^[a-f0-9]{32}$/);
    expect(checks[1]?.subject).toBe(`${checks[0]?.subject ?? ""}:${publicId}`);
  });

  it("should count nothing when there is no secret to key the hashes with", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    await expect(handleViewBeacon(beacon(), now)).resolves.toBe("ignored");
    expect(mocks.recordView).not.toHaveBeenCalled();
  });

  it("should give the same visitor two different hashes when they read on two days", async () => {
    await handleViewBeacon(beacon(), now);
    await handleViewBeacon(beacon(), new Date("2026-11-09T12:00:00Z"));
    const [first, second] = mocks.recordView.mock.calls.map(([view]) => view.visitor);
    expect(first).toBeDefined();
    expect(first).not.toBe(second);
  });
});
