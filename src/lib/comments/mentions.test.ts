import { describe, expect, it } from "vitest";

import { parseMentions, postedMentionMap, splitMentions } from "./mentions";

describe("parseMentions", () => {
  it("should find a handle at the start and in the middle of text", () => {
    expect(parseMentions("@claude-code please review, then ask @reviewer")).toEqual(["claude-code", "reviewer"]);
  });

  it("should ignore email addresses", () => {
    expect(parseMentions("Write to charles@example.com or ops@team.dev")).toEqual([]);
  });

  it("should ignore mentions in inline code and fenced code blocks", () => {
    const body = "Run `@scope/pkg` and `ping @bot`.\n\n```ts\nconst who = '@reviewer'\n```\nThanks @charles";
    expect(parseMentions(body)).toEqual(["charles"]);
  });

  it("should ignore mentions in tilde fences and unclosed fences", () => {
    expect(parseMentions("~~~\n@hidden\n~~~\n@shown")).toEqual(["shown"]);
    expect(parseMentions("@before\n```\n@never-closed")).toEqual(["before"]);
  });

  it("should stop the handle at trailing punctuation", () => {
    expect(parseMentions("Thanks @alice. And @bob, @carol! (@dave) @erin? @frank: @grace;")).toEqual([
      "alice",
      "bob",
      "carol",
      "dave",
      "erin",
      "frank",
      "grace",
    ]);
  });

  it("should return each handle once, lowercase, in first-seen order", () => {
    expect(parseMentions("@Reviewer @reviewer @REVIEWER @claude-code @reviewer")).toEqual(["reviewer", "claude-code"]);
  });

  it("should skip escaped mentions, paths, and URLs", () => {
    expect(parseMentions("\\@nobody https://x.dev/@someone ./@path")).toEqual([]);
  });

  it("should reject shapes that cannot be handles", () => {
    expect(parseMentions("@a @-x @x--y @" + "a".repeat(40))).toEqual([]);
  });

  it("should treat a trailing hyphen as punctuation", () => {
    expect(parseMentions("@alice- see above")).toEqual(["alice"]);
  });

  it("should find mentions in markdown emphasis, lists, and quotes", () => {
    expect(parseMentions("- **@alice** and _@bob_\n> @carol said")).toEqual(["alice", "bob", "carol"]);
  });

  it("should return nothing for text without mentions", () => {
    expect(parseMentions("No one here. @ alone and @@double")).toEqual([]);
  });
});

describe("splitMentions", () => {
  const resolved = new Map([["charles", "person" as const], ["claude-code", "agent" as const]]);

  it("should mark resolved handles and keep the text around them", () => {
    expect(splitMentions("Hi @charles and @Claude-Code.", resolved)).toEqual([
      { type: "text", value: "Hi " },
      { type: "mention", value: "@charles", handle: "charles", kind: "person" },
      { type: "text", value: " and " },
      { type: "mention", value: "@Claude-Code", handle: "claude-code", kind: "agent" },
      { type: "text", value: "." },
    ]);
  });

  it("should leave unresolved handles and emails as plain text", () => {
    expect(splitMentions("Ask @nobody or mail charles@example.com", resolved)).toEqual([{ type: "text", value: "Ask @nobody or mail charles@example.com" }]);
  });

  it("should keep markup-like text as plain text", () => {
    const text = "<img src=x onerror=alert(1)> @charles";
    const segments = splitMentions(text, resolved);
    expect(segments[0]).toEqual({ type: "text", value: "<img src=x onerror=alert(1)> " });
    expect(segments.map((segment) => segment.value).join("")).toBe(text);
  });

  it("should return nothing for empty text", () => {
    expect(splitMentions("", resolved)).toEqual([]);
  });
});

describe("postedMentionMap", () => {
  it("should keep the delivered mentions with their kinds", () => {
    const map = postedMentionMap([{ handle: "claude-code", kind: "agent" }], null);
    expect([...map]).toEqual([["claude-code", "agent"]]);
  });

  it("should add the author's own handle when the author mentions themself", () => {
    const map = postedMentionMap([], { handle: "dev", kind: "person" });
    expect(map.get("dev")).toBe("person");
  });

  it("should add nothing for an author without a handle", () => {
    expect(postedMentionMap([], { handle: null, kind: "person" }).size).toBe(0);
  });
});
