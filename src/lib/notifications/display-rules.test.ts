import { describe, expect, it } from "vitest";

import { actionPhrase, actorsLabel, commentExcerpt, EXCERPT_MAX, groupNotifications, notificationHref, type GroupableNotification } from "./display-rules";

describe("commentExcerpt", () => {
  it("should strip Markdown marks and keep link text without the address", () => {
    expect(commentExcerpt("## Plan\n\n**Looks good**, see [the doc](https://evil.example/x) and `code`.")).toBe("Plan Looks good, see the doc and code.");
  });

  it("should drop HTML tags so nothing renders as markup", () => {
    expect(commentExcerpt("<img src=x onerror=alert(1)>hi <b>there</b>")).toBe("hi there");
  });

  it("should cut long comments at the limit with an ellipsis", () => {
    const excerpt = commentExcerpt("word ".repeat(100));
    expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it("should keep a short comment whole", () => {
    expect(commentExcerpt("  Ship it  ")).toBe("Ship it");
  });
});

describe("notificationHref", () => {
  it("should open the artifact with its comments for comment kinds", () => {
    expect(notificationHref({ type: "mention", publicId: "abc", teamSlug: null })).toBe("/app?artifact=abc&comments=1");
  });

  it("should open the team page for a waiting request", () => {
    expect(notificationHref({ type: "share_request", publicId: "abc", teamSlug: "core" })).toBe("/teams/core?tab=artifacts&view=approval");
  });

  it("should open the artifact for a decision", () => {
    expect(notificationHref({ type: "share_declined", publicId: "abc", teamSlug: "core" })).toBe("/app?artifact=abc");
  });
});

describe("actionPhrase", () => {
  it("should name what was asked for each request kind", () => {
    expect(actionPhrase("share_request", "sharing")).toBe("asked to share");
    expect(actionPhrase("share_request", "edit")).toBe("asked to publish changes to");
    expect(actionPhrase("share_approved", "comments")).toBe("approved opening comments on");
    expect(actionPhrase("share_declined", null)).toBe("declined sharing");
  });

  it("should describe comment kinds", () => {
    expect(actionPhrase("reply", null)).toBe("replied to your comment on");
  });
});

describe("actorsLabel", () => {
  it("should name one, two, or the first and a count", () => {
    expect(actorsLabel([])).toBe("Someone");
    expect(actorsLabel(["Ada"])).toBe("Ada");
    expect(actorsLabel(["Ada", "Bo"])).toBe("Ada and Bo");
    expect(actorsLabel(["Ada", "Bo", "Cy"])).toBe("Ada and 2 others");
  });
});

describe("groupNotifications", () => {
  const item = (id: string, overrides: Partial<GroupableNotification> = {}): GroupableNotification => ({
    id,
    type: "comment",
    readAt: null,
    artifact: { publicId: "a1" },
    actor: { userId: `u-${id}` },
    ...overrides,
  });

  it("should fold unread comments on one artifact into one row when they arrive together", () => {
    const groups = groupNotifications([item("1"), item("2"), item("3", { artifact: { publicId: "a2" } })]);
    expect(groups.map((group) => group.items.map((entry) => entry.id))).toEqual([["1", "2"], ["3"]]);
  });

  it("should keep read comments apart from unread ones when grouping", () => {
    const groups = groupNotifications([item("1"), item("2", { readAt: "2026-11-08T00:00:00.000Z" })]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.unread)).toEqual([true, false]);
  });

  it("should keep each mention and request on its own row", () => {
    const groups = groupNotifications([item("1", { type: "mention" }), item("2", { type: "mention" }), item("3", { type: "share_request" })]);
    expect(groups).toHaveLength(3);
  });
});

describe("commentExcerpt with what a person typed", () => {
  it.each([
    ["Q&A at 3 < 4pm", "Q&A at 3 < 4pm"],
    ["rename snake_case_name", "rename snake_case_name"],
    ["Use C:\\temp", "Use C:\\temp"],
    ["see [docs] page", "see [docs] page"],
    ["2 * 3", "2 * 3"],
    ["2*3", "2*3"],
    ["on call 24*7", "on call 24*7"],
    ["every file* here", "every file* here"],
    ["a ~ b and x~y", "a ~ b and x~y"],
  ])("should show %j as typed when it is stored as typed", (body, excerpt) => {
    expect(commentExcerpt(body)).toBe(excerpt);
  });

  it.each([
    ["\\*not bold\\*", "*not bold*"],
    ["\\# not a heading", "# not a heading"],
    ["1\\. not a list", "1. not a list"],
    ["\\- not a list", "- not a list"],
    ["&lt;b> stays text", "<b> stays text"],
    ["Q&amp;A at 3 &lt; 4pm", "Q&A at 3 < 4pm"],
    ["snake\\_case and 2 \\* 3", "snake_case and 2 * 3"],
    ["\\@dana please", "@dana please"],
    ["&amp;copy; is literal", "&copy; is literal"],
  ])("should show the typed characters when %j keeps escapes", (body, excerpt) => {
    expect(commentExcerpt(body)).toBe(excerpt);
  });

  it("should never turn an escaped tag back into markup it then keeps as markup", () => {
    // Plain text: the excerpt shows the characters; the bell never renders it as HTML.
    expect(commentExcerpt("\\<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
  });

  it("should still take emphasis marks off when they are marks", () => {
    expect(commentExcerpt("**Looks** _good_ ~~old~~")).toBe("Looks good old");
  });

  it.each([
    ["2*3 and *done*", "2*3 and done"],
    ["*done* and 2*3", "done and 2*3"],
    ["**_both_** marks", "both marks"],
    ["2*3\n\n4*5", "2*3 4*5"],
  ])("should take off only the marks that pair when %j mixes marks and characters", (body, excerpt) => {
    expect(commentExcerpt(body)).toBe(excerpt);
  });
});
