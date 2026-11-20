import { describe, expect, it } from "vitest";

import { MENTION_BLOCK_MAX } from "./config";
import { addedMentions, documentMentionMissMessage, documentMentionReach, documentMentionReportOf, documentMentionStep, mentionBlock } from "./document-mention-rules";
import type { MentionCandidate } from "./rules";

const ada: MentionCandidate = { handle: "ada", userId: "u-ada", kind: "person", canView: true, isArtifactAuthor: false, sharesTeamWithWriter: true, muted: false };
const helper: MentionCandidate = { ...ada, handle: "helper", userId: "u-helper", kind: "agent" };
const person = { userId: "u-me", kind: "person" as const, muted: false };
const agentWriter = { userId: "u-bot", kind: "agent" as const, muted: false };

describe("documentMentionReach", () => {
  it("should reach a teammate who can read the artifact", () => {
    expect(documentMentionReach(ada, person)).toEqual({ reach: "reaches", miss: null });
  });

  it("should reach a teammate who cannot read it yet only later, once it is shared with them", () => {
    expect(documentMentionReach({ ...ada, canView: false }, person)).toEqual({ reach: "later", miss: null });
  });

  it("should reach nobody for an unknown handle or someone outside the writer's teams, with the same words for both", () => {
    const unknown = documentMentionReach({ ...ada, userId: null }, person);
    const stranger = documentMentionReach({ ...ada, sharesTeamWithWriter: false }, person);
    expect(unknown).toEqual({ reach: "none", miss: "unknown" });
    expect(stranger).toEqual(unknown);
    expect(documentMentionReach({ ...ada, sharesTeamWithWriter: false, canView: false }, person)).toEqual(unknown);
  });

  it("should never let an agent's save reach an agent, nor anyone reach a muted agent", () => {
    expect(documentMentionReach(helper, agentWriter)).toEqual({ reach: "none", miss: "agent_save" });
    expect(documentMentionReach({ ...helper, muted: true }, person)).toEqual({ reach: "none", miss: "muted" });
    expect(documentMentionReach(ada, agentWriter)).toEqual({ reach: "reaches", miss: null });
  });

  it("should reach nobody when the writer is a muted agent", () => {
    expect(documentMentionReach(ada, { ...agentWriter, muted: true })).toEqual({ reach: "none", miss: "writer_muted" });
  });

  it("should skip the writer's own handle", () => {
    expect(documentMentionReach({ ...ada, userId: "u-me" }, person)).toBeNull();
  });

  it("should sort a save's handles into who hears now, who hears once they can read it, and who never will", () => {
    const report = documentMentionReportOf([ada, { ...ada, handle: "bo", userId: "u-bo", canView: false }, { ...ada, handle: "nobody", userId: null }, { ...ada, userId: "u-me", handle: "me" }], person);
    expect(report).toEqual({ reaches: ["ada"], onceTheyCanRead: ["bo"], notNotified: [{ handle: "nobody", message: documentMentionMissMessage("nobody", "unknown") }] });
  });

  it("should tell the writer to use the exact handle when a handle reaches nobody", () => {
    expect(documentMentionMissMessage("ada", "unknown")).toMatch(/^@ada will not be notified\. .*exact @handle, not their name\.$/);
  });
});

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
