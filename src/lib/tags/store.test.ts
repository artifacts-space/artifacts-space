import { beforeEach, describe, expect, it, vi } from "vitest";

import { artifact, artifactVersion, team } from "@/db/schema";
import { createFakeDb } from "@/lib/projects/fake-db";
import { UserFacingError } from "@/lib/user-facing-error";

import { tagLimits } from "./limits";

/*
 * Changing an artifact's tags, against an in-memory database. The edit
 * check, the rate limit, and the scope's tag counts are mocked at their
 * module boundary.
 */

const state = vi.hoisted((): { db: unknown; editable: Record<string, unknown> | null } => ({ db: null, editable: null }));
const mocks = vi.hoisted(() => ({ enforceRateLimit: vi.fn(), recordArtifactSave: vi.fn(), scopeTagCount: vi.fn(), tagsInScope: vi.fn() }));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/access", () => ({ getEditableArtifact: () => Promise.resolve(state.editable) }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/versions/service", () => ({ recordArtifactSave: mocks.recordArtifactSave }));
vi.mock("./queries", () => ({ scopeTagCount: mocks.scopeTagCount, tagsInScope: mocks.tagsInScope, scopeTags: vi.fn() }));

const { setArtifactTags, tagsForNewArtifact } = await import("./store");

type Row = Record<string, unknown>;
let tables: Map<unknown, Row[]>;
let log: ReturnType<typeof createFakeDb>["log"];
const updatedAt = new Date("2026-11-01T00:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  tables = new Map<unknown, Row[]>([
    [artifact, [{ id: "a1", userId: "author", visibility: "private", teamId: null, tags: ["infra"], updatedAt, updatedBy: "author" }]],
    [team, []],
    [artifactVersion, []],
  ]);
  const fake = createFakeDb(tables);
  state.db = fake.db;
  log = fake.log;
  state.editable = tables.get(artifact)?.[0] ?? null;
  mocks.scopeTagCount.mockResolvedValue(10);
  mocks.tagsInScope.mockResolvedValue(new Set());
});

function current() {
  return tables.get(artifact)?.[0];
}

describe("setArtifactTags", () => {
  it("should answer not found and change nothing when the person may not edit the artifact", async () => {
    state.editable = null;
    await expect(setArtifactTags("stranger", "a1", { set: ["launch"] })).resolves.toBeUndefined();
    expect(log).toEqual([]);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("should save the normalized set without repeats when tags are replaced", async () => {
    await expect(setArtifactTags("author", "a1", { set: [" Needs Review", "needs-review", "Q4"] })).resolves.toEqual(["needs-review", "q4"]);
    expect(current()?.tags).toEqual(["needs-review", "q4"]);
  });

  it("should keep the other tags when some are added and removed", async () => {
    Object.assign(current() ?? {}, { tags: ["infra", "old"] });
    await expect(setArtifactTags("author", "a1", { add: ["Launch"], remove: ["OLD"] })).resolves.toEqual(["infra", "launch"]);
  });

  it("should file no version and keep the save time when tags change", async () => {
    await setArtifactTags("author", "a1", { set: ["launch"] });
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
    expect(tables.get(artifactVersion)).toEqual([]);
    expect(current()).toMatchObject({ updatedAt, updatedBy: "author" });
    expect(log.filter((entry) => entry.table === artifact).map((entry) => entry.values)).toEqual([{ tags: ["launch"] }]);
  });

  it("should refuse more tags than one artifact may have and keep the old ones", async () => {
    const many = Array.from({ length: tagLimits.maxPerArtifact + 1 }, (_, index) => `tag-${String(index)}`);
    await expect(setArtifactTags("author", "a1", { set: many })).rejects.toBeInstanceOf(UserFacingError);
    expect(current()?.tags).toEqual(["infra"]);
  });

  it("should refuse a tag past the length limit with a message the caller can show", async () => {
    await expect(setArtifactTags("author", "a1", { set: ["x".repeat(tagLimits.maxChars + 1)] })).rejects.toThrow(`1 to ${String(tagLimits.maxChars)} characters`);
  });

  it("should refuse tags new to the space when it is at its runaway cap", async () => {
    mocks.scopeTagCount.mockResolvedValue(tagLimits.maxPerScope);
    await expect(setArtifactTags("author", "a1", { set: ["infra", "brand-new"] })).rejects.toThrow("different tags");
    expect(current()?.tags).toEqual(["infra"]);
  });

  it("should allow tags the full space already uses", async () => {
    mocks.scopeTagCount.mockResolvedValue(tagLimits.maxPerScope);
    mocks.tagsInScope.mockResolvedValue(new Set(["launch"]));
    await expect(setArtifactTags("author", "a1", { set: ["infra", "launch"] })).resolves.toEqual(["infra", "launch"]);
  });

  it("should count the change against the organize limit", async () => {
    await setArtifactTags("author", "a1", { set: [] });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("organize", "author");
  });
});

describe("tagsForNewArtifact", () => {
  it("should give no tags and check nothing when none are sent", async () => {
    await expect(tagsForNewArtifact("author", undefined)).resolves.toEqual([]);
    expect(mocks.tagsInScope).not.toHaveBeenCalled();
  });

  it("should check new tags against the author's own space", async () => {
    await expect(tagsForNewArtifact("author", ["Launch"])).resolves.toEqual(["launch"]);
    expect(mocks.tagsInScope).toHaveBeenCalledWith({ kind: "user", userId: "author" }, ["launch"]);
  });
});
