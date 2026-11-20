import { describe, expect, it } from "vitest";

import { MENTION_BLOCK_MAX } from "./config";
import { addedMentions, documentMentionStep, mentionBlock } from "./document-mention-rules";

describe("addedMentions", () => {
  it("should list the handles a save added when the text before had others", () => {
    expect([...addedMentions("Ask @ada.", "Ask @ada and @claude.")]).toEqual(["claude"]);
  });

  it("should list every handle when there was no text before", () => {
    expect([...addedMentions(null, "@ada @bo")]).toEqual(["ada", "bo"]);
  });

  it("should list nothing when a handle only moved", () => {
    expect([...addedMentions("@ada first", "then @ada")]).toEqual([]);
  });

  it("should ignore a handle inside code", () => {
    expect([...addedMentions("", "Run `@ada` here.")]).toEqual([]);
  });
});

describe("documentMentionStep", () => {
  it("should notify when the recipient was never told about this artifact's text", () => {
    expect(documentMentionStep({ stored: null, added: false })).toBe("notify");
  });

  it("should keep quiet when a save only keeps a handle the recipient was told about", () => {
    expect(documentMentionStep({ stored: { read: true }, added: false })).toBe("keep");
  });

  it("should keep quiet when the handle is added again while the earlier notification is unread", () => {
    expect(documentMentionStep({ stored: { read: false }, added: true })).toBe("keep");
  });

  it("should notify again when the handle is added anew after the earlier notification was read", () => {
    expect(documentMentionStep({ stored: { read: true }, added: true })).toBe("notify_again");
  });
});

describe("mentionBlock", () => {
  it("should return the paragraph that mentions the handle", () => {
    const content = "# Plan\n\nFirst part.\n\nCan @claude tighten\nthis paragraph?\n\nLast part.";
    expect(mentionBlock(content, "claude")).toBe("Can @claude tighten\nthis paragraph?");
  });

  it("should return only the list item when the mention is in a list", () => {
    const content = "- one\n- two for @ada\n- three";
    expect(mentionBlock(content, "ada")).toBe("- two for @ada");
  });

  it("should return the heading alone when the mention is in a heading", () => {
    expect(mentionBlock("## For @ada\nBody text.", "ada")).toBe("## For @ada");
  });

  it("should skip a mention in fenced code and return the later real one", () => {
    const content = "```\n@ada in code\n```\n\nReal one for @ada.";
    expect(mentionBlock(content, "ada")).toBe("Real one for @ada.");
  });

  it("should return null when the handle appears only in code or in an email address", () => {
    expect(mentionBlock("`@ada` and mail ada@ada.com", "ada")).toBeNull();
  });

  it("should not match a longer handle that starts with the same letters", () => {
    expect(mentionBlock("Ask @adam.", "ada")).toBeNull();
  });

  it("should cut a very long block", () => {
    const block = mentionBlock(`@ada ${"word ".repeat(1000)}`, "ada");
    expect(block?.length).toBe(MENTION_BLOCK_MAX);
    expect(block?.endsWith("…")).toBe(true);
  });
});
