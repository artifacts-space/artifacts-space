import { beforeEach, describe, expect, it, vi } from "vitest";

import { artifact, artifactVersion } from "@/db/schema";
import { createFakeDb } from "@/lib/projects/fake-db";

/*
 * Changing an artifact's "Full width" setting, against an in-memory
 * database. The edit check (getEditableArtifact) and the rate limit are
 * mocked at their module boundary; the edit check answers for the caller.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted((): { db: unknown; editors: Set<string> } => ({ db: null, editors: new Set() }));
const mocks = vi.hoisted(() => ({ enforceRateLimit: vi.fn(), recordArtifactSave: vi.fn() }));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/versions/service", () => ({ recordArtifactSave: mocks.recordArtifactSave }));
vi.mock("@/lib/access", () => ({
  getEditableArtifact: (editorId: string) => Promise.resolve(state.editors.has(editorId) ? tables.get(artifact)?.[0] ?? null : null),
}));

const { setArtifactFullWidth } = await import("./store");

let tables: Map<unknown, Row[]>;
let log: ReturnType<typeof createFakeDb>["log"];
const updatedAt = new Date("2026-11-01T00:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  tables = new Map<unknown, Row[]>([
    [artifact, [{ id: "a1", publicId: "pub-1", userId: "author", visibility: "team", teamId: "t1", fullWidth: false, updatedAt, updatedBy: "author" }]],
    [artifactVersion, []],
  ]);
  const fake = createFakeDb(tables);
  state.db = fake.db;
  log = fake.log;
  // The author and a teammate on the team it is shared through may edit it.
  state.editors = new Set(["author", "teammate"]);
});

function current() {
  return tables.get(artifact)?.[0];
}

describe("setArtifactFullWidth", () => {
  it("should save full width when the author turns it on", async () => {
    await expect(setArtifactFullWidth("author", "a1", true)).resolves.toEqual({ publicId: "pub-1", fullWidth: true });
    expect(current()?.fullWidth).toBe(true);
  });

  it("should save the setting when a teammate who may edit changes it", async () => {
    Object.assign(current() ?? {}, { fullWidth: true });
    await expect(setArtifactFullWidth("teammate", "a1", false)).resolves.toEqual({ publicId: "pub-1", fullWidth: false });
    expect(current()?.fullWidth).toBe(false);
  });

  it.each([
    ["a viewer who can only read it", "viewer"],
    ["a stranger", "stranger"],
    ["an agent without edit rights", "agent-without-access"],
  ])("should answer not found and write nothing when %s asks", async (_who, callerId) => {
    await expect(setArtifactFullWidth(callerId, "a1", true)).resolves.toBeUndefined();
    expect(current()?.fullWidth).toBe(false);
    expect(log).toEqual([]);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("should file no version and keep the save time and editor when the setting changes", async () => {
    await setArtifactFullWidth("teammate", "a1", true);
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
    expect(tables.get(artifactVersion)).toEqual([]);
    expect(current()).toMatchObject({ updatedAt, updatedBy: "author" });
    expect(log.map((entry) => entry.values)).toEqual([{ fullWidth: true }]);
  });

  it("should write nothing when the setting is already as asked", async () => {
    await expect(setArtifactFullWidth("author", "a1", false)).resolves.toEqual({ publicId: "pub-1", fullWidth: false });
    expect(log).toEqual([]);
  });

  it("should count the change against the artifact edit limit", async () => {
    await setArtifactFullWidth("author", "a1", true);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith("artifactUpdate", "author");
  });

  it("should write nothing when the edit limit is reached", async () => {
    mocks.enforceRateLimit.mockRejectedValue(new Error("limit"));
    await expect(setArtifactFullWidth("author", "a1", true)).rejects.toThrow("limit");
    expect(log).toEqual([]);
  });
});
