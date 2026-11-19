import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BOT_SUSPECTED_CODE, BOT_SUSPECTED_MESSAGE, botCheckTimeoutMs } from "@/lib/abuse/bot-check-rules";

/* The host's bot check is mocked at its boundary: what each verdict, error, and delay does to the request. */

const mocks = vi.hoisted(() => ({ checkBotId: vi.fn<() => Promise<{ isBot: boolean; isVerifiedBot: boolean }>>() }));

vi.mock("botid/server", () => ({ checkBotId: mocks.checkBotId }));

const { refuseSuspectedBot } = await import("./bot-check");

describe("refuseSuspectedBot", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("VERCEL_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("should refuse with 403, uncached, when the check calls the request a bot", async () => {
    mocks.checkBotId.mockResolvedValue({ isBot: true, isVerifiedBot: false });
    const response = await refuseSuspectedBot();
    expect(response?.status).toBe(403);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.json()).toEqual({ code: BOT_SUSPECTED_CODE, message: BOT_SUSPECTED_MESSAGE });
  });

  it("should go on when the check finds a person or a verified bot", async () => {
    mocks.checkBotId.mockResolvedValue({ isBot: false, isVerifiedBot: false });
    expect(await refuseSuspectedBot()).toBeNull();
    mocks.checkBotId.mockResolvedValue({ isBot: true, isVerifiedBot: true });
    expect(await refuseSuspectedBot()).toBeNull();
  });

  it("should never ask the check when the server is not on Vercel", async () => {
    mocks.checkBotId.mockResolvedValue({ isBot: true, isVerifiedBot: false });
    for (const env of ["", "development"]) {
      vi.stubEnv("VERCEL_ENV", env);
      expect(await refuseSuspectedBot()).toBeNull();
    }
    expect(mocks.checkBotId).not.toHaveBeenCalled();
  });

  it("should go on, and log only the error's name, when the check fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.checkBotId.mockRejectedValue(new TypeError("fetch failed for ada@example.com"));
    expect(await refuseSuspectedBot()).toBeNull();
    expect(logged).toHaveBeenCalledWith("[auth] Bot check failed", "TypeError");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("ada@example.com");
  });

  it("should go on when no verdict comes in time, so sign-in never hangs on the check", async () => {
    vi.useFakeTimers();
    mocks.checkBotId.mockReturnValue(new Promise(() => undefined));
    const pending = refuseSuspectedBot();
    await vi.advanceTimersByTimeAsync(botCheckTimeoutMs);
    expect(await pending).toBeNull();
  });
});
