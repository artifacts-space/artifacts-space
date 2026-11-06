import { describe, expect, it } from "vitest";

import { rateLimits } from "@/lib/abuse/limits";

import { AGENT_LOOP_LIMIT, COMMENT_RATE_LIMITS } from "./config";
import {
  agentStreak,
  canChangeComment,
  canMuteInThread,
  canUseComments,
  decideMentions,
  isAgentMuted,
  isLoopLimited,
  type MentionCandidate,
} from "./rules";

const teammate: MentionCandidate = {
  handle: "dana",
  userId: "u-dana",
  kind: "person",
  canView: true,
  isArtifactAuthor: false,
  sharesTeamWithWriter: true,
  muted: false,
};
const reviewer: MentionCandidate = { ...teammate, handle: "reviewer", userId: "u-reviewer", kind: "agent" };

describe("comment permissions", () => {
  it("should let signed-in viewers who can view the artifact use comments", () => {
    expect(canUseComments({ signedIn: true, canViewArtifact: true })).toBe(true);
  });

  it("should refuse comments when the viewer is signed out or cannot view the artifact", () => {
    expect(canUseComments({ signedIn: false, canViewArtifact: true })).toBe(false);
    expect(canUseComments({ signedIn: true, canViewArtifact: false })).toBe(false);
  });

  it("should let only the author edit or delete a comment", () => {
    const live = { authorId: "a", deletedAt: null };
    expect(canChangeComment(live, "a")).toBe(true);
    expect(canChangeComment(live, "b")).toBe(false);
  });

  it("should refuse changes to deleted comments and comments whose author is gone", () => {
    expect(canChangeComment({ authorId: "a", deletedAt: new Date() }, "a")).toBe(false);
    expect(canChangeComment({ authorId: null, deletedAt: null }, "a")).toBe(false);
  });
});

describe("mention visibility", () => {
  it("should deliver a mention to a teammate who can view the artifact", () => {
    const result = decideMentions({ writerId: "me", candidates: [teammate], loopLimited: false });
    expect(result.deliver).toEqual([{ handle: "dana", userId: "u-dana", kind: "person" }]);
    expect(result.refused).toEqual([]);
  });

  it("should refuse a mention when the member cannot view the artifact", () => {
    const result = decideMentions({ writerId: "me", candidates: [{ ...teammate, canView: false }], loopLimited: false });
    expect(result.deliver).toEqual([]);
    expect(result.refused[0]?.reason).toBe("not_visible");
  });

  it("should refuse unknown handles with the same notice as hidden ones", () => {
    const unknown = decideMentions({ writerId: "me", candidates: [{ ...teammate, userId: null }], loopLimited: false });
    const hidden = decideMentions({ writerId: "me", candidates: [{ ...teammate, canView: false }], loopLimited: false });
    expect(unknown.refused[0]?.message).toBe(hidden.refused[0]?.message);
  });

  it("should refuse strangers who can view a public artifact but share no team with the writer", () => {
    const stranger = { ...teammate, sharesTeamWithWriter: false };
    expect(decideMentions({ writerId: "me", candidates: [stranger], loopLimited: false }).refused[0]?.reason).toBe("not_visible");
  });

  it("should deliver to the artifact's author even without a shared team", () => {
    const author = { ...teammate, sharesTeamWithWriter: false, isArtifactAuthor: true };
    expect(decideMentions({ writerId: "me", candidates: [author], loopLimited: false }).deliver).toHaveLength(1);
  });

  it("should ignore a mention of the writer", () => {
    const result = decideMentions({ writerId: "u-dana", candidates: [teammate], loopLimited: false });
    expect(result).toEqual({ deliver: [], refused: [] });
  });

  it("should refuse mentions past the per-comment cap", () => {
    const many = ["a1", "a2", "a3"].map((handle) => ({ ...teammate, handle, userId: `u-${handle}` }));
    const result = decideMentions({ writerId: "me", candidates: many, loopLimited: false, max: 2 });
    expect(result.deliver.map((item) => item.handle)).toEqual(["a1", "a2"]);
    expect(result.refused).toEqual([expect.objectContaining({ handle: "a3", reason: "too_many" })]);
  });
});

describe("mute decisions", () => {
  it("should treat an agent muted by its team or in the thread as muted", () => {
    expect(isAgentMuted({ teamMuted: true, threadMuted: false })).toBe(true);
    expect(isAgentMuted({ teamMuted: false, threadMuted: true })).toBe(true);
    expect(isAgentMuted({ teamMuted: false, threadMuted: false })).toBe(false);
  });

  it("should refuse mentions of a muted agent but not of people", () => {
    const result = decideMentions({ writerId: "me", candidates: [{ ...reviewer, muted: true }, teammate], loopLimited: false });
    expect(result.refused).toEqual([expect.objectContaining({ handle: "reviewer", reason: "muted" })]);
    expect(result.deliver.map((item) => item.handle)).toEqual(["dana"]);
  });

  it("should let the artifact author or the agent's teammates mute, and never agents", () => {
    expect(canMuteInThread({ viewerKind: "person", isArtifactAuthor: true, inAgentTeam: false })).toBe(true);
    expect(canMuteInThread({ viewerKind: "person", isArtifactAuthor: false, inAgentTeam: true })).toBe(true);
    expect(canMuteInThread({ viewerKind: "person", isArtifactAuthor: false, inAgentTeam: false })).toBe(false);
    expect(canMuteInThread({ viewerKind: "agent", isArtifactAuthor: true, inAgentTeam: true })).toBe(false);
  });
});

describe("agent loop limit", () => {
  it("should count agent comments at the end of the thread until a person", () => {
    expect(agentStreak(["agent", "agent", "person", "agent"])).toBe(2);
    expect(agentStreak(["person", "agent"])).toBe(0);
    expect(agentStreak([])).toBe(0);
  });

  it("should limit an agent once the thread ends with the configured number of agent comments", () => {
    expect(isLoopLimited({ writerKind: "agent", streakBefore: AGENT_LOOP_LIMIT })).toBe(true);
    expect(isLoopLimited({ writerKind: "agent", streakBefore: AGENT_LOOP_LIMIT - 1 })).toBe(false);
  });

  it("should never limit a person, whose post resets the streak", () => {
    expect(isLoopLimited({ writerKind: "person", streakBefore: AGENT_LOOP_LIMIT * 2 })).toBe(false);
  });

  it("should refuse agent mentions but still deliver person mentions when loop-limited", () => {
    const result = decideMentions({ writerId: "me", candidates: [reviewer, teammate], loopLimited: true });
    expect(result.refused).toEqual([expect.objectContaining({ handle: "reviewer", reason: "loop_limit" })]);
    expect(result.deliver.map((item) => item.handle)).toEqual(["dana"]);
  });
});

describe("comment rate limits", () => {
  it("should hold agents to stricter limits than people", () => {
    expect(rateLimits.agentCommentMinute.limit).toBeLessThan(rateLimits.personCommentMinute.limit);
    expect(rateLimits.agentCommentHour.limit).toBeLessThan(rateLimits.personCommentHour.limit);
  });

  it("should name a per-minute and a per-hour limit for each kind of author", () => {
    for (const names of Object.values(COMMENT_RATE_LIMITS)) {
      expect(names.map((name) => rateLimits[name].windowSeconds)).toEqual([60, 3600]);
    }
  });
});
