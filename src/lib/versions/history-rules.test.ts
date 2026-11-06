import { describe, expect, it } from "vitest";

import { selectPrunableVersions, shouldMergeInto, VERSION_MERGE_WINDOW_MS, versionBytes, versionRetention, type MergeTarget } from "./history-rules";

const now = new Date("2026-11-06T12:00:00Z");
const secondsAgo = (seconds: number) => new Date(now.getTime() - seconds * 1000);
const latest = (overrides: Partial<MergeTarget> = {}): MergeTarget => ({ id: "v1", createdBy: "ann", savedAt: secondsAgo(30), saveKind: "edit", ...overrides });
const none = new Set<string>();

describe("shouldMergeInto", () => {
  it("should merge when the same editor saves again within the window", () => {
    expect(shouldMergeInto(latest(), { editorId: "ann", saveKind: "edit", now }, none)).toBe(true);
  });

  it("should not merge when another editor saves", () => {
    expect(shouldMergeInto(latest(), { editorId: "bob", saveKind: "edit", now }, none)).toBe(false);
  });

  it("should not merge when the window has passed", () => {
    const old = latest({ savedAt: new Date(now.getTime() - VERSION_MERGE_WINDOW_MS - 1) });
    expect(shouldMergeInto(old, { editorId: "ann", saveKind: "edit", now }, none)).toBe(false);
  });

  it("should not merge into the approved version or one waiting for approval", () => {
    expect(shouldMergeInto(latest(), { editorId: "ann", saveKind: "edit", now }, new Set(["v1"]))).toBe(false);
  });

  it("should never merge a restore, or into a restore or snapshot", () => {
    expect(shouldMergeInto(latest(), { editorId: "ann", saveKind: "restore", now }, none)).toBe(false);
    expect(shouldMergeInto(latest({ saveKind: "restore" }), { editorId: "ann", saveKind: "edit", now }, none)).toBe(false);
    expect(shouldMergeInto(latest({ saveKind: "snapshot" }), { editorId: "ann", saveKind: "edit", now }, none)).toBe(false);
  });

  it("should merge a quick fix into the first version and file changes into an edit", () => {
    expect(shouldMergeInto(latest({ saveKind: "create" }), { editorId: "ann", saveKind: "edit", now }, none)).toBe(true);
    expect(shouldMergeInto(latest(), { editorId: "ann", saveKind: "files", now }, none)).toBe(true);
  });

  it("should not merge when there is no version yet or the editor is unknown", () => {
    expect(shouldMergeInto(null, { editorId: "ann", saveKind: "edit", now }, none)).toBe(false);
    expect(shouldMergeInto(latest({ createdBy: null }), { editorId: "ann", saveKind: "edit", now }, none)).toBe(false);
  });
});

describe("selectPrunableVersions", () => {
  const versions = (count: number, ageSeconds = 60) =>
    Array.from({ length: count }, (_, index) => ({ id: `v${String(count - index)}`, savedAt: secondsAgo(ageSeconds + index) }));

  it("should keep the newest 100 versions when there are 105", () => {
    const pruned = selectPrunableVersions(versions(105), none, now);
    expect(pruned).toEqual(["v5", "v4", "v3", "v2", "v1"]);
    expect(105 - pruned.length).toBe(versionRetention.keep);
  });

  it("should keep the approved version and the one waiting for approval even past the limit", () => {
    const pruned = selectPrunableVersions(versions(105), new Set(["v1", "v3"]), now);
    expect(pruned).toEqual(["v5", "v4", "v2"]);
  });

  it("should prune versions older than a year but keep the newest", () => {
    const yearAndADay = (versionRetention.maxAgeMs + 86_400_000) / 1000;
    const old = versions(3, yearAndADay);
    expect(selectPrunableVersions(old, none, now)).toEqual(["v2", "v1"]);
  });

  it("should prune nothing when the history is short and recent", () => {
    expect(selectPrunableVersions(versions(10), none, now)).toEqual([]);
  });
});

describe("versionBytes", () => {
  it("should count content and metadata in UTF-8 bytes", () => {
    expect(versionBytes({ content: "é", metadata: {} })).toBe(2 + 2);
  });
});
