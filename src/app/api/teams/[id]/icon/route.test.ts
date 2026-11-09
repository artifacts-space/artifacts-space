import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as RateLimit from "@/lib/abuse/rate-limit";

/*
 * The team icon route: members get a 302 to a short-lived link, and everyone
 * else (signed out, outside the team, a malformed id) gets the same 404, so
 * the route never says whether a team or its icon exists. Nothing is cached.
 * The session, the signer, the network key, and the rate limit are mocked
 * at their boundaries.
 */

const mocks = vi.hoisted(() => ({ session: vi.fn(), signed: vi.fn(), limits: vi.fn() }));

vi.mock("@/lib/abuse/network-key", () => ({ networkKey: () => "network-1" }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/teams/team-icon", () => ({ signedTeamIconUrl: mocks.signed }));
vi.mock("@/lib/abuse/rate-limit", async (importOriginal) => ({ ...(await importOriginal<typeof RateLimit>()), hitRateLimits: mocks.limits }));

const { GET } = await import("./route");

function call(id: string) {
  const request = new Request(`http://localhost/api/teams/${id}/icon?v=1`);
  return GET(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.limits.mockResolvedValue(null);
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
});

describe("GET /api/teams/[id]/icon", () => {
  it("should redirect a member to the signed link without caching the redirect", async () => {
    mocks.signed.mockResolvedValue("https://r2.example.com/signed");
    const response = await call("team-1");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://r2.example.com/signed");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.signed).toHaveBeenCalledWith("user-1", "team-1");
  });

  it("should answer 404 to someone signed out without looking up the icon", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call("team-1")).status).toBe(404);
    expect(mocks.signed).not.toHaveBeenCalled();
  });

  it("should answer 404 to someone outside the team", async () => {
    mocks.signed.mockResolvedValue(null);
    const response = await call("team-1");
    expect(response.status).toBe(404);
    expect(response.headers.get("Location")).toBeNull();
  });

  it("should answer 404 to a malformed team id without looking it up", async () => {
    expect((await call("../files")).status).toBe(404);
    expect(mocks.signed).not.toHaveBeenCalled();
  });

  it("should answer 429 when the network is over its team icon limit", async () => {
    mocks.limits.mockResolvedValue({ name: "teamIconByNetwork", retryAfterSeconds: 60 });
    expect((await call("team-1")).status).toBe(429);
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.limits).toHaveBeenCalledWith([{ name: "teamIconByNetwork", subject: "network-1" }]);
  });

  it("should answer 500 without details when signing fails", async () => {
    mocks.signed.mockRejectedValue(new Error("R2 down"));
    const response = await call("team-1");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("R2 down");
  });
});
