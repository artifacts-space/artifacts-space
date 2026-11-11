import { describe, expect, it } from "vitest";

import {
  agentRefusalMessage,
  agentWriteRefusal,
  BASE_CLOCK_SKEW_MS,
  EDIT_SIGNAL_INTERVAL_MS,
  encodeBaseVersion,
  isPlausibleBase,
  leaseIsLive,
  parseBaseVersion,
  RECENT_TYPING_MS,
  shouldSignalEditing,
  touchesGuardedFields,
  VERSION_CLOCK_SKEW_MS,
} from "./edit-conflict-rules";

const versionId = "0b6f3c1e-5a4d-4c2b-9e8f-1a2b3c4d5e6f";
const readAt = new Date("2026-11-11T13:08:00.123Z");

describe("baseVersion tokens", () => {
  it("should round-trip the version id and the save time when encoded and parsed", () => {
    const token = encodeBaseVersion({ versionId, updatedAt: readAt });
    expect(parseBaseVersion(token)).toEqual({ versionId, updatedAt: readAt });
  });

  it("should accept an ISO save time when encoding", () => {
    expect(encodeBaseVersion({ versionId, updatedAt: readAt.toISOString() })).toBe(`${versionId}.${String(readAt.getTime())}`);
  });

  it("should mark an artifact with no version yet when encoding", () => {
    expect(parseBaseVersion(encodeBaseVersion({ versionId: null, updatedAt: readAt }))).toEqual({ versionId: "start", updatedAt: readAt });
  });

  it.each(["", "latest", versionId, `${versionId}.`, `${versionId}.abc`, `not-a-version.${String(readAt.getTime())}`, `${versionId}.1.2`])(
    "should reject %j when it is not a token the server handed out",
    (token) => {
      expect(parseBaseVersion(token)).toBeNull();
    },
  );
});

describe("agentWriteRefusal", () => {
  const base = { versionId, updatedAt: readAt };

  it("should accept a save when the artifact is still at the agent's base version", () => {
    expect(agentWriteRefusal({ base, updatedAt: new Date(readAt), guarded: true, leaseLive: false })).toBeNull();
  });

  it("should refuse a stale agent save when someone saved after the agent read it", () => {
    expect(agentWriteRefusal({ base, updatedAt: new Date(readAt.getTime() + 1), guarded: true, leaseLive: false })).toBe("changed");
  });

  it("should refuse a stale agent save even when it changes no guarded field", () => {
    expect(agentWriteRefusal({ base, updatedAt: new Date(readAt.getTime() + 60_000), guarded: false, leaseLive: false })).toBe("changed");
  });

  it("should accept a current agent save while a person types, because it names its base", () => {
    expect(agentWriteRefusal({ base, updatedAt: readAt, guarded: true, leaseLive: true })).toBeNull();
  });

  it("should refuse a save without a base while a person's lease is live", () => {
    expect(agentWriteRefusal({ base: undefined, updatedAt: readAt, guarded: true, leaseLive: true })).toBe("editing");
  });

  it("should accept a save without a base after the lease expired", () => {
    expect(agentWriteRefusal({ base: undefined, updatedAt: readAt, guarded: true, leaseLive: false })).toBeNull();
  });

  it("should accept a save without a base that changes no title, content, or format during a lease", () => {
    expect(agentWriteRefusal({ base: undefined, updatedAt: readAt, guarded: false, leaseLive: true })).toBeNull();
  });
});

describe("touchesGuardedFields", () => {
  it.each([{ title: "New" }, { content: "x" }, { kind: "csv" }])("should be true when %j changes", (changes) => {
    expect(touchesGuardedFields(changes)).toBe(true);
  });

  it("should be false when only other fields change", () => {
    expect(touchesGuardedFields({ title: undefined, content: undefined })).toBe(false);
  });
});

describe("leaseIsLive", () => {
  const now = new Date("2026-11-11T13:29:00Z");

  it("should be live before its expiry", () => {
    expect(leaseIsLive(new Date(now.getTime() + 1), now)).toBe(true);
  });

  it("should not be live at or after its expiry, or without a lease", () => {
    expect(leaseIsLive(now, now)).toBe(false);
    expect(leaseIsLive(new Date(now.getTime() - 1), now)).toBe(false);
    expect(leaseIsLive(null, now)).toBe(false);
  });
});

describe("shouldSignalEditing", () => {
  const now = 1_000_000;

  it("should signal on the first change with unsaved edits", () => {
    expect(shouldSignalEditing({ now, lastSignalAt: null, unsaved: true, lastInputAt: now })).toBe(true);
  });

  it("should not signal again within the interval", () => {
    expect(shouldSignalEditing({ now, lastSignalAt: now - EDIT_SIGNAL_INTERVAL_MS + 1, unsaved: true, lastInputAt: now })).toBe(false);
  });

  it("should signal again once the interval passed while typing goes on", () => {
    expect(shouldSignalEditing({ now, lastSignalAt: now - EDIT_SIGNAL_INTERVAL_MS, unsaved: false, lastInputAt: now })).toBe(true);
  });

  it("should not signal when everything is saved and nobody typed lately", () => {
    expect(shouldSignalEditing({ now, lastSignalAt: null, unsaved: false, lastInputAt: now - RECENT_TYPING_MS - 1 })).toBe(false);
    expect(shouldSignalEditing({ now, lastSignalAt: null, unsaved: false, lastInputAt: null })).toBe(false);
  });
});

describe("agentRefusalMessage", () => {
  it("should name who changed it via the web and say how to recover", () => {
    const message = agentRefusalMessage("changed", { handle: "charles", harness: null });
    expect(message).toContain("This artifact changed since you read it (by @charles via the web).");
    expect(message).toContain("Read it again with artifacts_get, merge your changes into the new content, and save with the new baseVersion.");
  });

  it("should name the agent harness when an agent changed it", () => {
    expect(agentRefusalMessage("changed", { handle: "charles", harness: { id: "claude-code", name: "Claude Code" } })).toContain("(by @charles via Claude Code)");
  });

  it("should say someone is editing right now when a lease refused it", () => {
    expect(agentRefusalMessage("editing", { handle: "charles", harness: null })).toMatch(/^@charles is editing this artifact in the web app right now\./);
    expect(agentRefusalMessage("editing", null)).toMatch(/^Someone is editing this artifact/);
  });
});

describe("isPlausibleBase", () => {
  const now = new Date("2026-11-11T13:29:00Z");

  it("should accept a base the server handed out, up to the allowed clock skew", () => {
    expect(isPlausibleBase(new Date("2026-11-11T13:08:00Z"), now)).toBe(true);
    expect(isPlausibleBase(new Date(now.getTime() + BASE_CLOCK_SKEW_MS), now)).toBe(true);
  });

  it("should allow only a few seconds of clock drift between server instances", () => {
    expect(BASE_CLOCK_SKEW_MS).toBeLessThanOrEqual(5_000);
    expect(isPlausibleBase(new Date(now.getTime() + BASE_CLOCK_SKEW_MS - 1), now), "just inside the window").toBe(true);
    expect(isPlausibleBase(new Date(now.getTime() + 10_000), now), "ten seconds ahead").toBe(false);
  });

  it("should refuse a base from the future, which would let a stale save land over a person's newer one", () => {
    expect(isPlausibleBase(new Date(now.getTime() + BASE_CLOCK_SKEW_MS + 1), now)).toBe(false);
    expect(isPlausibleBase(new Date("3000-01-01T00:00:00Z"), now)).toBe(false);
  });
});

describe("VERSION_CLOCK_SKEW_MS", () => {
  it("should stay below the base skew, because every millisecond of it is a window where a newer person's save is missed", () => {
    expect(VERSION_CLOCK_SKEW_MS).toBeGreaterThan(0);
    expect(VERSION_CLOCK_SKEW_MS).toBeLessThan(BASE_CLOCK_SKEW_MS);
  });
});
