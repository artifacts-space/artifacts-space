import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signInLinkProtection } from "@/lib/abuse/bot-check-rules";

/*
 * The browser half, with the host's package mocked at its boundary: that the
 * check starts once, for the sign-in link request alone, and only in a
 * browser. Whether a real browser then passes is checked on a deployment.
 */

const mocks = vi.hoisted(() => ({ initBotId: vi.fn<(options: { protect: { path: string; method: string }[] }) => void>() }));

vi.mock("botid/client/core", () => ({ initBotId: mocks.initBotId }));

/** A fresh copy of the module, so each test starts with the check not yet started. */
async function freshStart() {
  vi.resetModules();
  return (await import("./bot-check-client")).startSignInLinkBotCheck;
}

describe("startSignInLinkBotCheck", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should start the check once, for the sign-in link request alone, when the form mounts again", async () => {
    vi.stubGlobal("window", {});
    const start = await freshStart();
    start();
    start();
    expect(mocks.initBotId.mock.calls).toEqual([[{ protect: signInLinkProtection }]]);
  });

  it("should never start the check when there is no browser", async () => {
    const start = await freshStart();
    start();
    expect(mocks.initBotId).not.toHaveBeenCalled();
  });

  it("should try again on the next mount when the start threw, and log only the error's name", async () => {
    vi.stubGlobal("window", {});
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.initBotId.mockImplementationOnce(() => {
      throw new TypeError("no fetch to patch");
    });
    const start = await freshStart();
    start();
    expect(logged).toHaveBeenCalledWith("[auth] Bot check did not start", "TypeError");
    start();
    start();
    expect(mocks.initBotId).toHaveBeenCalledTimes(2);
  });
});
