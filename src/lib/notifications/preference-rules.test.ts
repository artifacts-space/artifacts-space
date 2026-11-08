import { describe, expect, it } from "vitest";

import { anyBrowserOn, changePreference, defaultPreferences, emailAvailable, readPreferences, wants, withBrowserForAll } from "./preference-rules";

describe("readPreferences", () => {
  it("should use the defaults when nothing is stored", () => {
    const preferences = readPreferences(undefined);
    expect(preferences.comment).toEqual({ inApp: true, browser: false, email: false });
    expect(preferences.mention).toEqual({ inApp: true, browser: false, email: true });
  });

  it("should keep stored choices and fill in missing ones when a row is partial", () => {
    const preferences = readPreferences({ reply: { inApp: false } });
    expect(preferences.reply).toEqual({ inApp: false, browser: false, email: false });
    expect(preferences.comment.inApp).toBe(true);
  });

  it("should fall back to defaults when a stored value is not a boolean", () => {
    expect(readPreferences({ comment: { inApp: "no" } }).comment.inApp).toBe(true);
    expect(readPreferences("garbage").mention.email).toBe(true);
  });

  it("should keep email off when the event sends no email even if stored on", () => {
    expect(readPreferences({ comment: { email: true } }).comment.email).toBe(false);
  });
});

describe("changePreference", () => {
  it("should change one channel of one event when asked", () => {
    const next = changePreference(defaultPreferences(), "mention", "email", false);
    expect(next.mention.email).toBe(false);
    expect(next.mention.inApp).toBe(true);
    expect(next.reply.email).toBe(false);
  });

  it("should ignore turning on email when the event sends none", () => {
    const current = defaultPreferences();
    expect(changePreference(current, "share_request", "email", true)).toBe(current);
  });
});

describe("browser choices", () => {
  it("should turn browser on for every event when a person enables browser notifications", () => {
    const next = withBrowserForAll(defaultPreferences());
    expect(anyBrowserOn(next)).toBe(true);
    expect(next.share_decision.browser).toBe(true);
    expect(next.mention.email).toBe(true);
  });

  it("should report browser off when nothing is turned on", () => {
    expect(anyBrowserOn(defaultPreferences())).toBe(false);
  });
});

describe("wants", () => {
  it("should read approved and declined requests from the one decision setting", () => {
    const quiet = changePreference(defaultPreferences(), "share_decision", "inApp", false);
    expect(wants(quiet, "share_approved", "inApp")).toBe(false);
    expect(wants(quiet, "share_declined", "inApp")).toBe(false);
    expect(wants(quiet, "share_request", "inApp")).toBe(true);
  });

  it("should say only mentions offer email", () => {
    expect(emailAvailable("mention")).toBe(true);
    expect(emailAvailable("comment")).toBe(false);
  });
});
