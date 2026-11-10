import { beforeEach, describe, expect, it, vi } from "vitest";

import { artifact, artifactVersion } from "@/db/schema";
import { createFakeDb } from "@/lib/projects/fake-db";

/*
 * Saving a sheet's formatting, against an in-memory database. The edit
 * check (getEditableArtifactMeta) and the rate limit are mocked at their
 * module boundary; the edit check answers for the caller and hands back the
 * artifact asked for, so a write to the wrong artifact shows.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted((): { db: unknown; editors: Set<string> } => ({ db: null, editors: new Set() }));
const mocks = vi.hoisted(() => ({ enforceRateLimit: vi.fn(), recordArtifactSave: vi.fn() }));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/abuse/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/versions/service", () => ({ recordArtifactSave: mocks.recordArtifactSave }));
vi.mock("@/lib/access", () => ({
  getEditableArtifactMeta: (editorId: string, artifactId: string) =>
    Promise.resolve(state.editors.has(editorId) ? tables.get(artifact)?.find((row) => row.id === artifactId) ?? null : null),
}));

const { setSheetFormat } = await import("./store");

let tables: Map<unknown, Row[]>;
let log: ReturnType<typeof createFakeDb>["log"];
const updatedAt = new Date("2026-11-01T00:00:00Z");
const banded = { banding: "muted", align: { '="price"': "right" } } as const;

beforeEach(() => {
  vi.resetAllMocks();
  tables = new Map<unknown, Row[]>([
    [
      artifact,
      [
        { id: "a1", publicId: "pub-1", kind: "csv", userId: "author", visibility: "team", teamId: "t1", sheetFormat: null, updatedAt, updatedBy: "author" },
        { id: "a2", publicId: "pub-2", kind: "csv", userId: "author", visibility: "team", teamId: "t1", sheetFormat: null, updatedAt, updatedBy: "author" },
      ],
    ],
    [artifactVersion, []],
  ]);
  const fake = createFakeDb(tables);
  state.db = fake.db;
  log = fake.log;
  state.editors = new Set(["author", "teammate"]);
});

function current(id = "a1") {
  return tables.get(artifact)?.find((row) => row.id === id);
}

describe("setSheetFormat", () => {
  it("should save the formatting when someone who may edit changes it", async () => {
    await expect(setSheetFormat("teammate", "a1", banded)).resolves.toEqual({ publicId: "pub-1", format: banded });
    expect(current()?.sheetFormat).toEqual(banded);
  });

  it("should write only the artifact it was given when the editor may edit several", async () => {
    await expect(setSheetFormat("author", "a2", banded)).resolves.toEqual({ publicId: "pub-2", format: banded });
    expect(current("a2")?.sheetFormat).toEqual(banded);
    expect(current("a1")?.sheetFormat, "the other artifact stays as it was").toBeNull();
    expect(log).toHaveLength(1);
  });

  it("should answer not found when the artifact does not exist", async () => {
    await expect(setSheetFormat("author", "missing", banded)).resolves.toBeUndefined();
    expect(log).toEqual([]);
  });

  it.each([
    ["a reader who can only read it", "viewer"],
    ["a stranger", "stranger"],
    ["an agent without edit rights", "agent-without-access"],
  ])("should answer not found and write nothing when %s asks", async (_who, callerId) => {
    await expect(setSheetFormat(callerId, "a1", banded)).resolves.toBeUndefined();
    expect(current()?.sheetFormat).toBeNull();
    expect(log).toEqual([]);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });

  it("should answer not found when the artifact is not a CSV", async () => {
    Object.assign(current() ?? {}, { kind: "markdown" });
    await expect(setSheetFormat("author", "a1", banded)).resolves.toBeUndefined();
    expect(log).toEqual([]);
  });

  it("should store nothing when the sheet goes back to plain", async () => {
    Object.assign(current() ?? {}, { sheetFormat: banded });
    await expect(setSheetFormat("author", "a1", { banding: null, align: {} })).resolves.toEqual({ publicId: "pub-1", format: { banding: null, align: {} } });
    expect(current()?.sheetFormat).toBeNull();
  });

  it("should file no version and keep the save time and editor when the formatting changes", async () => {
    await setSheetFormat("teammate", "a1", banded);
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
    expect(tables.get(artifactVersion)).toEqual([]);
    expect(current()).toMatchObject({ updatedAt, updatedBy: "author" });
  });

  it("should write nothing when the formatting is already as asked", async () => {
    Object.assign(current() ?? {}, { sheetFormat: banded });
    await setSheetFormat("author", "a1", banded);
    expect(log).toEqual([]);
  });

  it("should write nothing when only the order of the stored columns differs, as jsonb reorders keys", async () => {
    Object.assign(current() ?? {}, { sheetFormat: { banding: "muted", align: { '="b"': "right", '="a"': "left" } } });
    await setSheetFormat("author", "a1", { banding: "muted", align: { '="a"': "left", '="b"': "right" } });
    expect(log).toEqual([]);
  });

  it("should write nothing when the edit limit is reached", async () => {
    mocks.enforceRateLimit.mockRejectedValue(new Error("limit"));
    await expect(setSheetFormat("author", "a1", banded)).rejects.toThrow("limit");
    expect(log).toEqual([]);
  });
});
