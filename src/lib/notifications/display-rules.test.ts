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
