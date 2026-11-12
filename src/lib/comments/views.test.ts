import { describe, expect, it } from "vitest";

import type { CommentRecord } from "@/db/schema";
import type { Actor } from "@/lib/agents/identity";

import { anchorGate } from "./anchor-privacy-rules";
import { actorIdsOf, toCommentView, type CommentViewContext } from "./views";

const at = new Date("2026-11-12T10:00:00.000Z");
const record: CommentRecord = {
  id: "c1",
  artifactId: "a1",
  authorId: "u-dana",
  parentId: null,
  body: "Is this date right?",
  createdAt: at,
  updatedAt: at,
  deletedAt: null,
  quote: "on Monday",
  quotePrefix: "We ship the beta",
  quoteSuffix: ".",
  resolvedAt: null,
  resolvedBy: null,
};
const dana: Actor = { kind: "person", userId: "u-dana", handle: "dana", name: "Dana" };
const actors = new Map<string, Actor>([["u-dana", dana]]);
const person: CommentViewContext = { viewerKind: "person", anchorFor: anchorGate({ source: "latest" }) };

describe("toCommentView anchors", () => {
  it("should show the stored anchor when the viewer is served the latest version", () => {
    const view = toCommentView(record, actors, "u-dana", [], person);
    expect(view.anchored).toBe(true);
    expect(view.anchor).toEqual({ quote: "on Monday", prefix: "We ship the beta", suffix: "." });
  });

  it("should withhold the quote but keep anchored when the approved version lacks the words", () => {
    // Fails if a hidden quote is returned to a reader of the approved version.
    const view = toCommentView(record, actors, "u-other", [], { viewerKind: "person", anchorFor: anchorGate({ source: "approved", content: "We ship the beta on Friday." }) });
    expect(view.anchored).toBe(true);
    expect(view.anchor).toBeNull();
    expect(JSON.stringify(view)).not.toContain("Monday");
  });

  it("should hide every anchor when the caller passes no context", () => {
    const view = toCommentView(record, actors, "u-dana");
    expect(view.anchor).toBeNull();
    expect(view.canResolve).toBe(false);
  });

  it("should give no anchor when the comment is a reply or deleted", () => {
    expect(toCommentView({ ...record, parentId: "c0" }, actors, "u-dana", [], person)).toMatchObject({ anchored: false, anchor: null, canResolve: false });
    expect(toCommentView({ ...record, deletedAt: at }, actors, "u-dana", [], person)).toMatchObject({ anchored: false, anchor: null, canResolve: false });
  });

  it("should not be anchored when the comment is on the whole artifact", () => {
    expect(toCommentView({ ...record, quote: null }, actors, "u-dana", [], person)).toMatchObject({ anchored: false, anchor: null });
  });
});

describe("toCommentView resolved state", () => {
  it("should credit the resolver by label when the thread is resolved", () => {
    const view = toCommentView({ ...record, resolvedAt: at, resolvedBy: "u-dana" }, actors, "u-dana", [], person);
    expect(view.resolved).toEqual({ at: at.toISOString(), by: "@dana" });
  });

  it("should leave the resolver null when their account is gone", () => {
    expect(toCommentView({ ...record, resolvedAt: at, resolvedBy: null }, actors, "u-dana", [], person).resolved).toEqual({ at: at.toISOString(), by: null });
  });

  it("should not mark a resolved thread edited when only its resolution changed", () => {
    expect(toCommentView({ ...record, resolvedAt: new Date("2026-11-12T11:00:00.000Z"), resolvedBy: "u-dana" }, actors, "u-dana", [], person).edited).toBe(false);
  });

  it("should let a person resolve and refuse an agent when the comment is top-level", () => {
    expect(toCommentView(record, actors, "u-dana", [], person).canResolve).toBe(true);
    expect(toCommentView(record, actors, "u-agent", [], { ...person, viewerKind: "agent" }).canResolve).toBe(false);
  });
});

describe("actorIdsOf", () => {
  it("should list authors and resolvers once when rows share them", () => {
    expect(actorIdsOf([record, { ...record, id: "c2", resolvedBy: "u-lee" }, { ...record, id: "c3", authorId: null }])).toEqual(["u-dana", "u-lee"]);
  });
});
