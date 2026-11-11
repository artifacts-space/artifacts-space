import { describe, expect, it } from "vitest";

import {
  buildFeedbackPayload,
  capText,
  deployLabel,
  escapeSlackText,
  escapeWithin,
  FEEDBACK_NOTE_MAX_LENGTH,
  feedbackInputSchema,
  feedbackMessages,
  feedbackNoteError,
  pagePath,
  slackWebhookUrl,
  teamSlugFromLocation,
  type FeedbackReport,
} from "./feedback-rules";

function report(overrides: Partial<FeedbackReport> = {}): FeedbackReport {
  return {
    note: "The Save button does nothing.",
    name: "Avery Example",
    email: "avery@example.com",
    path: "/app",
    teamSlug: null,
    userAgent: "Mozilla/5.0 (Macintosh) Chrome/150",
    viewport: { width: 1440, height: 900 },
    deploy: "abc1234 (preview)",
    sentAt: new Date("2026-11-11T13:00:00.000Z"),
    ...overrides,
  };
}

/** Every text a Slack message would show, in order. */
function texts(payload: ReturnType<typeof buildFeedbackPayload>): string[] {
  return payload.blocks.flatMap((block) => {
    if ("fields" in block) return block.fields.map((field) => field.text);
    if ("elements" in block) return block.elements.map((element) => element.text);
    return [block.text.text];
  });
}

/** Every text object in the message. */
function textObjects(payload: ReturnType<typeof buildFeedbackPayload>) {
  return payload.blocks.flatMap((block) => ("fields" in block ? block.fields : "elements" in block ? block.elements : [block.text]));
}

describe("slackWebhookUrl", () => {
  it("should accept a Slack Incoming Webhook URL when it starts with https://hooks.slack.com/", () => {
    expect(slackWebhookUrl("https://hooks.slack.com/services/T000/B000/XXXX")).toBe("https://hooks.slack.com/services/T000/B000/XXXX");
  });

  it("should trim surrounding whitespace when the URL is otherwise valid", () => {
    expect(slackWebhookUrl("  https://hooks.slack.com/services/T000/B000/XXXX\n")).toBe("https://hooks.slack.com/services/T000/B000/XXXX");
  });

  it.each([
    ["missing", undefined],
    ["blank", "   "],
    ["the bare prefix", "https://hooks.slack.com/"],
    ["http", "http://hooks.slack.com/services/T000/B000/XXXX"],
    ["another host", "https://example.com/services/T000/B000/XXXX"],
    ["a look-alike host", "https://hooks.slack.com.example.com/services/T000"],
    ["credentials", "https://user:pass@hooks.slack.com/services/T000"],
    ["a port", "https://hooks.slack.com:8443/services/T000"],
    ["upper-case scheme trickery", "HTTPS://hooks.slack.com/services/T000"],
    ["not a URL", "hooks.slack.com/services/T000"],
  ])("should treat feedback as unconfigured when the URL is %s", (_case, value) => {
    expect(slackWebhookUrl(value)).toBeNull();
  });
});

describe("pagePath", () => {
  it("should keep only the pathname when the address has a query string and a hash", () => {
    expect(pagePath("/app?team=acme&project=launch&artifact=abc#comments")).toBe("/app");
  });

  it("should drop the hash when there is no query string", () => {
    expect(pagePath("/teams/acme#members")).toBe("/teams/acme");
  });

  it("should fall back to / when the value is not a path", () => {
    expect(pagePath("https://evil.example/app")).toBe("/");
    expect(pagePath("")).toBe("/");
  });

  it("should cap a very long path when it passes the limit", () => {
    const path = pagePath(`/${"a".repeat(1000)}`);
    expect(path.length).toBe(300);
    expect(path.endsWith("…")).toBe(true);
  });
});

describe("teamSlugFromLocation", () => {
  it("should read the team page's slug when on /teams/<slug>", () => {
    expect(teamSlugFromLocation("/teams/acme-co", "")).toBe("acme-co");
  });

  it("should read the workspace scope when ?team= is set", () => {
    expect(teamSlugFromLocation("/app", "?team=acme&project=launch")).toBe("acme");
  });

  it("should return null when the page has no team", () => {
    expect(teamSlugFromLocation("/app", "?project=launch")).toBeNull();
    expect(teamSlugFromLocation("/teams/new", "")).toBeNull();
    expect(teamSlugFromLocation("/teams", "")).toBeNull();
  });

  it("should return null when the slug holds anything but letters, digits, and hyphens", () => {
    expect(teamSlugFromLocation("/app", "?team=<!channel>")).toBeNull();
    expect(teamSlugFromLocation("/teams/a%20b", "")).toBeNull();
  });
});

describe("feedbackNoteError", () => {
  it("should ask for a note when it is empty or only spaces", () => {
    expect(feedbackNoteError("   \n ")).toBe(feedbackMessages.empty);
  });

  it("should refuse a note when it is longer than the limit", () => {
    expect(feedbackNoteError("x".repeat(FEEDBACK_NOTE_MAX_LENGTH + 1))).toBe(feedbackMessages.tooLong);
  });

  it("should accept a note when it is exactly at the limit", () => {
    expect(feedbackNoteError("x".repeat(FEEDBACK_NOTE_MAX_LENGTH))).toBe("");
  });
});

describe("feedbackInputSchema", () => {
  it("should give the same messages as the dialog when the note is empty or too long", () => {
    expect(feedbackInputSchema.safeParse({ note: " " }).error?.issues[0]?.message).toBe(feedbackMessages.empty);
    expect(feedbackInputSchema.safeParse({ note: "x".repeat(FEEDBACK_NOTE_MAX_LENGTH + 1) }).error?.issues[0]?.message).toBe(feedbackMessages.tooLong);
  });

  it("should drop context it cannot trust when the fields are malformed", () => {
    const parsed = feedbackInputSchema.parse({ note: "Broken", path: 42, teamSlug: "<!here>", viewport: { width: -1, height: "tall" } });
    expect(parsed).toEqual({ note: "Broken", path: "/", teamSlug: null, viewport: null });
  });
});

describe("escapeSlackText", () => {
  it("should escape &, <, and > when they appear", () => {
    expect(escapeSlackText("a & b <!channel> c > d")).toBe("a &amp; b &lt;!channel&gt; c &gt; d");
  });

  it("should never split an entity when the escaped text is cut", () => {
    const cut = escapeWithin("<".repeat(10), 12);
    expect(cut).toBe("&lt;&lt;…");
    expect(cut.length).toBeLessThanOrEqual(12);
  });
});

describe("capText", () => {
  it("should remove control characters but keep newlines and tabs", () => {
    expect(capText("a\u0000b\u0007c\nd\te", 100)).toBe("abc\nd\te");
  });
});

describe("deployLabel", () => {
  it("should shorten the commit and name the environment when both are set", () => {
    expect(deployLabel("0123456789abcdef", "production")).toBe("0123456 (production)");
  });

  it("should say unknown and local when neither is set", () => {
    expect(deployLabel(undefined, undefined)).toBe("unknown commit (local)");
  });
});

describe("buildFeedbackPayload", () => {
  it("should hold the note, who sent it, the page, the team, the browser, the viewport, the deploy, and the time", () => {
    const shown = texts(buildFeedbackPayload(report({ teamSlug: "acme" }))).join("\n");
    for (const part of ["The Save button does nothing.", "Avery Example", "avery@example.com", "Page: /app", "Team: acme", "Viewport: 1440 × 900", "Deploy: abc1234 (preview)", "Chrome/150", "2026-11-11T13:00:00.000Z"]) {
      expect(shown).toContain(part);
    }
  });

  it("should say personal workspace when there is no team", () => {
    expect(texts(buildFeedbackPayload(report()))).toContain("Team: Personal workspace");
  });

  it("should send every text as plain_text so Slack never parses mentions or links", () => {
    const payload = buildFeedbackPayload(report());
    expect(new Set(textObjects(payload).map((text) => text.type))).toEqual(new Set(["plain_text"]));
    expect(JSON.stringify(payload)).not.toContain("mrkdwn");
    expect(payload.unfurl_links).toBe(false);
    expect(payload.unfurl_media).toBe(false);
  });

  it("should escape a note when it tries to ping @channel, mention someone, or link", () => {
    const payload = buildFeedbackPayload(report({ note: "<!channel> <!here> <@U123> <https://evil.example|click> & more", name: "<!everyone>" }));
    const shown = texts(payload).join("\n");
    expect(shown).not.toMatch(/[<>]/);
    expect(shown).toContain("&lt;!channel&gt; &lt;!here&gt; &lt;@U123&gt; &lt;https://evil.example|click&gt; &amp; more");
    expect(shown).toContain("From: &lt;!everyone&gt;");
  });

  it("should keep the notification text free of anything the person typed", () => {
    const payload = buildFeedbackPayload(report({ note: "<!channel> secret", name: "<!here>" }));
    expect(payload.text).not.toContain("secret");
    expect(payload.text).not.toMatch(/[<>]/);
  });

  it("should strip the query string and hash when the path carries them", () => {
    const shown = texts(buildFeedbackPayload(report({ path: "/app?project=secret-launch&tag=q4#artifact" })));
    expect(shown).toContain("Page: /app");
    expect(shown.join("\n")).not.toContain("secret-launch");
  });

  it("should cap every field within Slack's limits when values are huge", () => {
    const huge = "<".repeat(5000);
    const payload = buildFeedbackPayload(report({ note: huge, name: huge, email: huge, userAgent: huge, path: `/${huge}` }));
    const limits = { header: 150, section: 3000, fields: 2000, context: 2000 };
    for (const block of payload.blocks) {
      const kind = "fields" in block ? "fields" : block.type;
      const longest = Math.max(...(block.type === "context" ? block.elements : "fields" in block ? block.fields : [block.text]).map((text) => text.text.length));
      expect(longest, kind).toBeLessThanOrEqual(limits[kind]);
    }
  });

  it("should cap the name and the browser when they are long", () => {
    const shown = texts(buildFeedbackPayload(report({ name: "n".repeat(500), userAgent: "u".repeat(1000) })));
    expect(shown.find((text) => text.startsWith("From: "))?.length).toBe("From: ".length + 100);
    expect(shown.find((text) => text.startsWith("Browser: "))?.length).toBe("Browser: ".length + 300);
  });
});
