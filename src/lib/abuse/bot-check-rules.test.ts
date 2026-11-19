import { afterEach, describe, expect, it, vi } from "vitest";

import { botCheckRuns, refusesSignInLink, SIGN_IN_LINK_CHECK_LEVEL, SIGN_IN_LINK_PATH, SIGN_IN_LINK_STALLED, signInLinkProtection, signInLinkWaitMs, withinSignInLinkWait } from "@/lib/abuse/bot-check-rules";
import { isMagicLinkRequest } from "@/lib/auth/magic-link-limits";

describe("refusesSignInLink", () => {
  it("should refuse when the check calls the request a bot it cannot name", () => {
    expect(refusesSignInLink({ isBot: true, isVerifiedBot: false, bypassed: false })).toBe(true);
  });

  it("should let a person through when the check finds no bot", () => {
    expect(refusesSignInLink({ isBot: false, isVerifiedBot: false, bypassed: false })).toBe(false);
  });

  it("should let a verified bot through when the check names it, since agents are users here", () => {
    expect(refusesSignInLink({ isBot: true, isVerifiedBot: true, bypassed: false })).toBe(false);
    expect(refusesSignInLink({ isBot: false, isVerifiedBot: true, bypassed: false })).toBe(false);
  });

  it("should let a request through when the owner's firewall bypass rule matched it, whatever the verdict", () => {
    expect(refusesSignInLink({ isBot: true, isVerifiedBot: false, bypassed: true })).toBe(false);
  });
});

describe("botCheckRuns", () => {
  it("should run on Vercel deployments only when the environment says so", () => {
    expect(botCheckRuns({ VERCEL_ENV: "production" })).toBe(true);
    expect(botCheckRuns({ VERCEL_ENV: "preview" })).toBe(true);
  });

  it("should not run when there is no host check to ask: development, tests, a self-hosted server", () => {
    expect(botCheckRuns({ VERCEL_ENV: "development" })).toBe(false);
    expect(botCheckRuns({ VERCEL_ENV: "" })).toBe(false);
    expect(botCheckRuns({})).toBe(false);
  });
});

describe("signInLinkProtection", () => {
  it("should name only the request the server checks when the browser proves itself", () => {
    expect(SIGN_IN_LINK_PATH).toBe("/api/auth/sign-in/magic-link");
    expect(SIGN_IN_LINK_CHECK_LEVEL).toBe("deepAnalysis");
    expect(signInLinkProtection).toEqual([{ path: SIGN_IN_LINK_PATH, method: "POST", advancedOptions: { checkLevel: SIGN_IN_LINK_CHECK_LEVEL } }]);
    for (const { method, path } of signInLinkProtection) expect(isMagicLinkRequest(method, path)).toBe(true);
  });
});

describe("withinSignInLinkWait", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should give the request's answer when it comes in time, and leave no timer running", async () => {
    vi.useFakeTimers();
    expect(await withinSignInLinkWait(Promise.resolve("sent"))).toBe("sent");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("should answer that the request stalled when nothing came within the wait", async () => {
    vi.useFakeTimers();
    const answer = withinSignInLinkWait(new Promise<string>(() => undefined));
    await vi.advanceTimersByTimeAsync(signInLinkWaitMs - 1);
    await expect(Promise.race([answer, Promise.resolve("still waiting")])).resolves.toBe("still waiting");
    await vi.advanceTimersByTimeAsync(1);
    expect(await answer).toBe(SIGN_IN_LINK_STALLED);
  });

  it("should pass the request's own failure on", async () => {
    await expect(withinSignInLinkWait(Promise.reject(new Error("offline")))).rejects.toThrow("offline");
  });
});
