import { beforeEach, describe, expect, it, vi } from "vitest";

import { mintRenderToken } from "./token";

/*
 * The render page's files address action: null for every refusal and
 * failure, and the address only when the token opens, the page key is a
 * public id, the person's page views are within their limit, and the
 * address rules give one. The rate limit and the address are mocked.
 */

const data = vi.hoisted(() => ({ hitRateLimit: vi.fn(), renderPageAddress: vi.fn() }));
vi.mock("@/lib/abuse/rate-limit", () => ({ hitRateLimit: data.hitRateLimit }));
vi.mock("./load", () => ({ renderPageAddress: data.renderPageAddress }));

const { renderPageAddressAction } = await import("./actions");

const secret = "a test secret that is long enough to derive keys from";
const pageKey = "4fXkP9qR2sT7vW1yZ3aB5c";
const address = { token: "files-token", expiresAt: "2026-11-24T09:45:00.000Z", lifeMs: 600_000 };

function token() {
  return mintRenderToken({ userId: "user-1", artifactId: "internal-1", stamp: 1 });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  data.hitRateLimit.mockResolvedValue({ allowed: true });
  data.renderPageAddress.mockResolvedValue(address);
});

describe("renderPageAddressAction", () => {
  it("should give the address, counted against the person who asked, when every check passes", async () => {
    expect(await renderPageAddressAction(token(), { pageKey })).toEqual(address);
    expect(data.hitRateLimit).toHaveBeenCalledWith("pageAddress", "user-1");
  });

  it("should give null and count nothing when the token is not one", async () => {
    expect(await renderPageAddressAction("not a token!", { pageKey })).toBeNull();
    expect(data.hitRateLimit).not.toHaveBeenCalled();
    expect(data.renderPageAddress).not.toHaveBeenCalled();
  });

  it("should give null when the page key is not a public id", async () => {
    expect(await renderPageAddressAction(token(), { pageKey: "../other" })).toBeNull();
    expect(data.renderPageAddress).not.toHaveBeenCalled();
  });

  it("should give null when the person is over their page view limit", async () => {
    data.hitRateLimit.mockResolvedValue({ allowed: false });
    expect(await renderPageAddressAction(token(), { pageKey })).toBeNull();
    expect(data.renderPageAddress).not.toHaveBeenCalled();
  });

  it("should give null without throwing when making the address fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    data.renderPageAddress.mockRejectedValue(new Error("database down"));
    expect(await renderPageAddressAction(token(), { pageKey })).toBeNull();
  });
});
