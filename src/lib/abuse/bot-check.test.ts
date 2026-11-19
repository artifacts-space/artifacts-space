import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BOT_SUSPECTED_CODE, BOT_SUSPECTED_MESSAGE, botCheckTimeoutMs, signInLinkProtection } from "@/lib/abuse/bot-check-rules";

/* The host's bot check is mocked at its boundary: what each verdict, error, and delay does to the request. */

const mocks = vi.hoisted(() => ({ checkBotId: vi.fn<(options?: { advancedOptions?: { checkLevel?: string } }) => Promise<{ isBot: boolean; isVerifiedBot: boolean; bypassed: boolean }>>() }));

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

  it("should refuse with 403, uncached, and log one bare line when the check calls the request a bot", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.checkBotId.mockResolvedValue({ isBot: true, isVerifiedBot: false, bypassed: false });
    const response = await refuseSuspectedBot();
    expect(warned.mock.calls).toEqual([["[auth] Sign-in link refused: suspected bot"]]);
    expect(response?.status).toBe(403);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.json()).toEqual({ code: BOT_SUSPECTED_CODE, message: BOT_SUSPECTED_MESSAGE });
  });

  it("should ask the server for the same level the browser was told to prove, since a mismatch fails the check for everyone", async () => {
    mocks.checkBotId.mockResolvedValue({ isBot: false, isVerifiedBot: false, bypassed: false });
    await refuseSuspectedBot();
    const asked = mocks.checkBotId.mock.calls[0]?.[0]?.advancedOptions?.checkLevel;
    expect(asked).toBe("deepAnalysis");
    for (const route of signInLinkProtection) expect(route.advancedOptions.checkLevel).toBe(asked);
  });

  it("should go on, and log nothing, when the check finds a person, a verified bot, or a bypassed request", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const verdict of [{ isBot: false, isVerifiedBot: false, bypassed: false }, { isBot: true, isVerifiedBot: true, bypassed: false }, { isBot: true, isVerifiedBot: false, bypassed: true }]) {
      mocks.checkBotId.mockResolvedValue(verdict);
      expect(await refuseSuspectedBot()).toBeNull();
    }
    expect(warned).not.toHaveBeenCalled();
  });

  it("should never ask the check when the server is not on Vercel", async () => {
    mocks.checkBotId.mockResolvedValue({ isBot: true, isVerifiedBot: false, bypassed: false });
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
