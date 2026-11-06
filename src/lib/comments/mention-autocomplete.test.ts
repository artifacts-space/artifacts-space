import { describe, expect, it } from "vitest";

import { activeMentionQuery, composerMentionMap, insertMention, matchMentionables, type Mentionable } from "./mention-autocomplete";

const people: Mentionable[] = [
  { userId: "user-charles", handle: "charles", name: "Charles Smith", kind: "person" },
  { userId: "user-claude-code", handle: "claude-code", name: "Claude Code", kind: "agent" },
  { userId: "user-dana", handle: "dana", name: "Dana Charleston", kind: "person" },
  { userId: "user-reviewer-bot", handle: "reviewer-bot", name: "Review Bot", kind: "agent" },
];

describe("activeMentionQuery", () => {
  it("should find the letters typed after @ at the caret", () => {
    expect(activeMentionQuery("Hi @Cha", 7)).toEqual({ start: 3, query: "cha" });
  });

  it("should open on a bare @ at the start of the text", () => {
    expect(activeMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
  });

  it("should ignore emails and paths", () => {
    expect(activeMentionQuery("mail me@exa", 11)).toBeNull();
    expect(activeMentionQuery("see site/@x", 11)).toBeNull();
  });

  it("should close once a space follows the handle", () => {
    expect(activeMentionQuery("@charles ", 9)).toBeNull();
  });

  it("should look only at text before the caret", () => {
    expect(activeMentionQuery("@ch and more", 3)).toEqual({ start: 0, query: "ch" });
  });
});

describe("matchMentionables", () => {
  it("should rank handle prefixes before name words and handle substrings", () => {
    expect(matchMentionables(people, "c").map((item) => item.handle)).toEqual(["charles", "claude-code", "dana"]);
  });

  it("should match a word of the name", () => {
    expect(matchMentionables(people, "review").map((item) => item.handle)).toEqual(["reviewer-bot"]);
  });

  it("should match anywhere in the handle as a last resort", () => {
    expect(matchMentionables(people, "bot").map((item) => item.handle)).toEqual(["reviewer-bot"]);
  });

  it("should list everyone by handle for an empty query, up to the limit", () => {
    expect(matchMentionables(people, "", 2).map((item) => item.handle)).toEqual(["charles", "claude-code"]);
  });

  it("should return nothing when no one matches", () => {
    expect(matchMentionables(people, "zz")).toEqual([]);
  });
});

describe("insertMention", () => {
  it("should replace the typed letters with the handle and a space", () => {
    expect(insertMention("Hi @cha", { start: 3, query: "cha" }, 7, "charles")).toEqual({ text: "Hi @charles ", caret: 12 });
  });

  it("should replace the rest of a handle after the caret", () => {
    expect(insertMention("@chxx please", { start: 0, query: "ch" }, 3, "charles")).toEqual({ text: "@charles please", caret: 9 });
  });

  it("should not add a space before punctuation that follows", () => {
    expect(insertMention("@c, thanks", { start: 0, query: "c" }, 2, "charles")).toEqual({ text: "@charles, thanks", caret: 8 });
  });
});

describe("composerMentionMap", () => {
  it("should resolve every reachable candidate with its kind", () => {
    const map = composerMentionMap({ candidates: people, self: null });
    expect(map.get("charles")).toBe("person");
    expect(map.get("claude-code")).toBe("agent");
    expect(map.has("handle")).toBe(false);
  });

  it("should resolve the writer's own handle when the writer has one", () => {
    const self: Mentionable = { userId: "user-dev", handle: "dev", name: "Dev", kind: "person" };
    expect(composerMentionMap({ candidates: [], self }).get("dev")).toBe("person");
  });

  it("should resolve nothing when nobody is reachable and the writer has no handle", () => {
    expect(composerMentionMap({ candidates: [], self: null }).size).toBe(0);
  });
});
