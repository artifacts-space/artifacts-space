import { describe, expect, it } from "vitest";

import { parseMentions } from "./mentions";

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
