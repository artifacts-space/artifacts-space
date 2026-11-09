import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as RateLimit from "@/lib/abuse/rate-limit";

/*
 * The team icon route: members get the icon's bytes, kept by their own
 * browser for a day when the URL names the current icon, and everyone else
 * (signed out, outside the team, a malformed id) gets the same uncached 404,
 * so the route never says whether a team or its icon exists. Each member
 * has their own limit; the network has a larger backstop. The session, the
 * icon reader, the network key, and the rate limit are mocked at their
 * boundaries.
 */

const mocks = vi.hoisted(() => ({ session: vi.fn(), icon: vi.fn(), limits: vi.fn() }));

vi.mock("@/lib/abuse/network-key", () => ({ networkKey: () => "network-1" }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/teams/team-icon", () => ({ memberTeamIcon: mocks.icon }));
vi.mock("@/lib/abuse/rate-limit", async (importOriginal) => ({ ...(await importOriginal<typeof RateLimit>()), hitRateLimits: mocks.limits }));

const { GET } = await import("./route");

const iconId = "7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a";
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function call(id: string, version: string | null = iconId) {
  const query = version === null ? "" : `?v=${version}`;
  const request = new Request(`http://localhost/api/teams/${id}/icon${query}`);
  return GET(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.limits.mockResolvedValue(null);
  mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  mocks.icon.mockResolvedValue({ bytes: pngBytes, type: "image/png", id: iconId });
});

describe("GET /api/teams/[id]/icon", () => {
  it("should send a member the icon and let only their browser keep it for a day when v names the current icon", async () => {
    const response = await call("team-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=86400, immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pngBytes);
    expect(mocks.icon).toHaveBeenCalledWith("user-1", "team-1");
  });

  it("should send the current icon uncached when v names an icon since replaced", async () => {
    const response = await call("team-1", "00000000-0000-4000-8000-000000000000");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("should send the icon uncached when the URL has no v", async () => {
    expect((await call("team-1", null)).headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("should answer an uncached 404 to someone signed out without looking up the icon", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await call("team-1");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.icon).not.toHaveBeenCalled();
  });

  it("should never send the icon to a signed-in person outside the team", async () => {
    mocks.session.mockResolvedValue({ user: { id: "stranger" } });
    mocks.icon.mockImplementation((viewerId: string) => Promise.resolve(viewerId === "user-1" ? { bytes: pngBytes, type: "image/png", id: iconId } : null));
    const response = await call("team-1");
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("Not found");
  });

  it("should answer 404 to a malformed team id without looking it up", async () => {
    expect((await call("../files")).status).toBe(404);
    expect(mocks.icon).not.toHaveBeenCalled();
  });

  it("should count a member against their own limit and the network backstop", async () => {
    await call("team-1");
    expect(mocks.limits).toHaveBeenCalledWith([
      { name: "teamIconByUser", subject: "user-1" },
      { name: "teamIconByNetwork", subject: "network-1" },
    ]);
  });

  it("should count a signed-out request against the network only", async () => {
    mocks.session.mockResolvedValue(null);
    await call("team-1");
    expect(mocks.limits).toHaveBeenCalledWith([{ name: "teamIconByNetwork", subject: "network-1" }]);
  });

  it("should answer an uncached 429 without reading the icon when a limit refuses", async () => {
    mocks.limits.mockResolvedValue({ name: "teamIconByUser", retryAfterSeconds: 60 });
    const response = await call("team-1");
    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.icon).not.toHaveBeenCalled();
  });

  it("should still send the icon when the rate limit counter fails", async () => {
    mocks.limits.mockRejectedValue(new Error("db down"));
    expect((await call("team-1")).status).toBe(200);
  });

  it("should answer 500 without details when reading the icon fails", async () => {
    mocks.icon.mockRejectedValue(new Error("R2 down"));
    const response = await call("team-1");
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("R2 down");
  });
});
