import { describe, expect, it } from "vitest";

import { artifactVisibilities } from "@/lib/artifact-types";

import {
  countsViews,
  daySalt,
  isBotUserAgent,
  isCrossSiteBeacon,
  parseViewBeacon,
  referrerDomain,
  viewDay,
  viewDecision,
  viewHashSecret,
  visitorHash,
} from "./view-rules";

const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const publicId = "AbCdEfGhJkLmNpQrStUvWx";

describe("countsViews", () => {
  it("should count only public artifacts when the visibility is checked", () => {
    expect(artifactVisibilities.filter(countsViews)).toEqual(["public"]);
  });

  it("should not count link artifacts when their URL was shared privately", () => {
    expect(countsViews("link")).toBe(false);
  });
});

describe("viewDecision", () => {
  const reader = { visibility: "public" as const, canEdit: false, bot: false };

  it("should count a reader who cannot edit a public artifact", () => {
    expect(viewDecision(reader)).toBe("count");
  });

  it("should ignore the author and team editors when they open the page", () => {
    expect(viewDecision({ ...reader, canEdit: true })).toBe("editor");
  });

  it("should ignore bots when the user agent is a bot", () => {
    expect(viewDecision({ ...reader, bot: true })).toBe("bot");
  });

  it("should ignore every reader when the artifact is not public", () => {
    for (const visibility of ["private", "team", "link"] as const) {
      expect(viewDecision({ ...reader, visibility })).toBe("not-counted-visibility");
    }
  });
});

describe("isBotUserAgent", () => {
  it("should treat crawlers, unfurlers, scripts, and headless browsers as bots", () => {
    const bots = [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "facebookexternalhit/1.1",
      "curl/8.7.1",
      "python-requests/2.32.3",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
      "Mozilla/5.0 (compatible; Chrome-Lighthouse)",
      "",
      "x".repeat(600),
    ];
    for (const agent of bots) expect(isBotUserAgent(agent), agent.slice(0, 40)).toBe(true);
  });

  it("should treat desktop and phone browsers as people", () => {
    expect(isBotUserAgent(chrome)).toBe(false);
    expect(isBotUserAgent(safari)).toBe(false);
  });

  it("should treat a missing user agent as a bot", () => {
    expect(isBotUserAgent(null)).toBe(true);
  });
});

describe("isCrossSiteBeacon", () => {
  it("should refuse a beacon when another site sent it", () => {
    expect(isCrossSiteBeacon(new Headers({ "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isCrossSiteBeacon(new Headers({ "sec-fetch-site": "same-site" }))).toBe(true);
  });

  it("should accept a beacon when our own page sent it or the header is missing", () => {
    expect(isCrossSiteBeacon(new Headers({ "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(isCrossSiteBeacon(new Headers())).toBe(false);
  });
});

describe("parseViewBeacon", () => {
  it("should read the id and referrer when the body is valid", () => {
    expect(parseViewBeacon(JSON.stringify({ id: publicId, referrer: "https://example.com/a" }))).toEqual({ id: publicId, referrer: "https://example.com/a" });
  });

  it("should refuse a body when it is not JSON, has a bad id, or is too long", () => {
    expect(parseViewBeacon("not json")).toBeNull();
    expect(parseViewBeacon(JSON.stringify({ id: "../../etc" }))).toBeNull();
    expect(parseViewBeacon(JSON.stringify({ id: publicId, referrer: "x".repeat(5000) }))).toBeNull();
    expect(parseViewBeacon("")).toBeNull();
  });
});

describe("referrerDomain", () => {
  it("should keep only the domain when the referrer is a full URL", () => {
    expect(referrerDomain("https://news.ycombinator.com/item?id=1&token=secret#x")).toBe("news.ycombinator.com");
  });

  it("should drop www and a trailing dot when the host has them", () => {
    expect(referrerDomain("https://www.Example.com./path")).toBe("example.com");
  });

  it("should keep only the domain of another artifact URL when one artifact links to another", () => {
    expect(referrerDomain("https://artifacts.space/artifact/AbCdEfGhJkLmNpQrStUvWx")).toBe("artifacts.space");
  });

  it("should give nothing when the referrer is empty, invalid, or not http", () => {
    expect(referrerDomain("")).toBeNull();
    expect(referrerDomain(undefined)).toBeNull();
    expect(referrerDomain("not a url")).toBeNull();
    expect(referrerDomain("javascript:alert(1)")).toBeNull();
    expect(referrerDomain("file:///Users/me/notes.html")).toBeNull();
  });
});

describe("viewDay", () => {
  it("should use the UTC date when the local time is a different day", () => {
    expect(viewDay(new Date("2026-11-08T23:59:59-05:00"))).toBe("2026-11-09");
  });
});

describe("visitor hashes", () => {
  const visitor = { address: "203.0.113.7", userAgent: chrome, artifactId: "artifact-1" };

  it("should give the same hash when the same reader returns on the same day", () => {
    const salt = daySalt("secret", "2026-11-08");
    expect(visitorHash({ ...visitor, salt })).toBe(visitorHash({ ...visitor, salt }));
  });

  it("should give a different hash when the day changes, so readers cannot be followed across days", () => {
    const today = visitorHash({ ...visitor, salt: daySalt("secret", "2026-11-08") });
    const tomorrow = visitorHash({ ...visitor, salt: daySalt("secret", "2026-11-09") });
    expect(today).not.toBe(tomorrow);
  });

  it("should give a different hash when the artifact differs, so readers cannot be matched across artifacts", () => {
    const salt = daySalt("secret", "2026-11-08");
    expect(visitorHash({ ...visitor, salt })).not.toBe(visitorHash({ ...visitor, salt, artifactId: "artifact-2" }));
  });

  it("should give a different salt when the secret differs", () => {
    expect(daySalt("a", "2026-11-08")).not.toBe(daySalt("b", "2026-11-08"));
  });

  it("should never contain the address or user agent when hashed", () => {
    const hash = visitorHash({ ...visitor, salt: daySalt("secret", "2026-11-08") });
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
    expect(hash).not.toContain("203");
  });
});

describe("viewHashSecret", () => {
  it("should give nothing when the secret is missing or blank, so nothing is counted", () => {
    expect(viewHashSecret({})).toBeNull();
    expect(viewHashSecret({ BETTER_AUTH_SECRET: "  " })).toBeNull();
  });

  it("should give the secret when it is set", () => {
    expect(viewHashSecret({ BETTER_AUTH_SECRET: "s3cret" })).toBe("s3cret");
  });
});
