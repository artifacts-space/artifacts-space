import { describe, expect, it } from "vitest";

import { deviceLabel, isAllowedPushEndpoint, pushMessage, pushOutcome, testPushMessage } from "./push-rules";

describe("isAllowedPushEndpoint", () => {
  it("should allow the push services of the major browsers", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc:def")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QAbc")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=abc")).toBe(true);
  });

  it("should refuse internal, plain HTTP, or look-alike addresses so the server never calls them", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedPushEndpoint("https://localhost/push")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://evilpush.apple.com.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("https://user:pass@fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
  });

  it("should refuse an address longer than the limit", () => {
    expect(isAllowedPushEndpoint(`https://fcm.googleapis.com/${"a".repeat(1000)}`)).toBe(false);
  });
});

describe("deviceLabel", () => {
  it("should name the browser and system when both are known", () => {
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")).toBe("Chrome on macOS");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0")).toBe("Edge on Windows");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iOS");
    expect(deviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0")).toBe("Firefox on Linux");
  });

  it("should fall back to a plain name when the user agent is missing", () => {
    expect(deviceLabel(null)).toBe("Browser");
  });
});

describe("pushMessage", () => {
  it("should say who did what on which artifact, with the excerpt as the body", () => {
    const message = pushMessage({ type: "mention", requestKind: null, actorLabel: "@ada", artifactTitle: "Plan", publicId: "p1", excerpt: "Can you check this?", href: "/app?artifact=p1&comments=1" });
    expect(message).toEqual({ v: 1, type: "mention", title: "@ada mentioned you on Plan", body: "Can you check this?", url: "/app?artifact=p1&comments=1", tag: "mention:p1" });
  });

  it("should keep the title and body short when the input is long", () => {
    const message = pushMessage({ type: "comment", requestKind: null, actorLabel: "@ada", artifactTitle: "T".repeat(300), publicId: "p1", excerpt: "x".repeat(500), href: "/app" });
    expect(message.title.length).toBeLessThanOrEqual(120);
    expect(message.body.length).toBeLessThanOrEqual(160);
  });

  it("should send no body for a request when there is no comment", () => {
    expect(pushMessage({ type: "share_request", requestKind: "sharing", actorLabel: null, artifactTitle: "Plan", publicId: "p1", excerpt: null, href: "/teams/core" }).body).toBe("");
  });

  it("should carry an excerpt's characters as plain text when the comment held a tag", () => {
    // The service worker hands the body to showNotification, which shows text and never reads HTML (public/sw.js).
    const message = pushMessage({ type: "comment", requestKind: null, actorLabel: "@ada", artifactTitle: "Plan", publicId: "p1", excerpt: "<img src=x onerror=alert(1)>", href: "/app" });
    expect(message.body).toBe("<img src=x onerror=alert(1)>");
  });

  it("should open settings from the test message", () => {
    expect(testPushMessage().url).toBe("/app/settings");
  });
});

describe("pushOutcome", () => {
  it("should remove the subscription only when the push service says it is gone", () => {
    expect(pushOutcome(201)).toBe("sent");
    expect(pushOutcome(404)).toBe("gone");
    expect(pushOutcome(410)).toBe("gone");
    expect(pushOutcome(429)).toBe("failed");
    expect(pushOutcome(500)).toBe("failed");
  });
});
