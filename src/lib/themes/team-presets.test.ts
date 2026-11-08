import type { Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { presetTheme } from "./resolve";

/*
 * Team presets in the database: changing presets or the team default is a
 * team setting, so it writes only team rows and never files an artifact
 * version. The database is a recording stand-in that answers each query
 * with the rows a test queues.
 */

const mocks = vi.hoisted(() => ({ writes: [] as { op: string; table: string; values: unknown }[], reads: [] as unknown[][], recordArtifactSave: vi.fn(), failInsertInto: null as string | null }));

vi.mock("@/lib/versions/service", () => ({ recordArtifactSave: mocks.recordArtifactSave }));
vi.mock("@/db", async () => {
  const { getTableName: tableName } = await import("drizzle-orm");
  const nextRead = () => Promise.resolve(mocks.reads.shift() ?? []);
  const chain = (): unknown => new Proxy(() => undefined, { get: (_t, key) => (key === "then" ? (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => nextRead().then(resolve, reject) : chain()), apply: () => chain() });
  const write = (op: string) => (table: Table) => {
    const record = (values: unknown) => {
      if (op === "insert" && mocks.failInsertInto === tableName(table)) throw new Error("insert failed");
      mocks.writes.push({ op, table: tableName(table), values });
      return chain();
    };
    return op === "delete" ? { where: () => { mocks.writes.push({ op, table: tableName(table), values: null }); return chain(); } } : { values: record, set: record };
  };
  return { getDb: () => ({ select: () => chain(), insert: write("insert"), update: write("update"), delete: write("delete") }) };
});

const store = await import("./team-presets");

function ocean() {
  const theme = presetTheme("ocean");
  if (!theme) throw new Error("ocean preset missing");
  return theme;
}

const presetRow = { id: "preset-1", teamId: "team-1", slug: "brand-abc234", name: "Brand", description: "", theme: ocean(), createdBy: "u", updatedBy: "u", createdAt: new Date(), updatedAt: new Date() };

beforeEach(() => {
  mocks.writes.length = 0;
  mocks.reads.length = 0;
  mocks.recordArtifactSave.mockReset();
});

const writtenTables = () => [...new Set(mocks.writes.map((write) => write.table))];

describe("team preset store", () => {
  it("should write only the preset table and file no artifact version when a preset is created", async () => {
    mocks.reads.push([{ value: 3 }], [presetRow]);
    const created = await store.createTeamPreset("team-1", "user-1", { name: "Brand", theme: ocean() });
    expect(created.ref).toBe("team:brand-abc234");
    expect(writtenTables()).toEqual(["team_theme_preset", "team_theme_revision"]);
    expect(mocks.writes[1]?.values).toMatchObject({ teamId: "team-1", kind: "preset", presetId: "preset-1", name: "Brand", theme: ocean(), createdBy: "user-1" });
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
  });

  it("should refuse a new preset when the team is at the runaway cap", async () => {
    mocks.reads.push([{ value: 50 }]);
    await expect(store.createTeamPreset("team-1", "user-1", { name: "Brand", theme: ocean() })).rejects.toThrow(/50 theme presets/);
    expect(mocks.writes).toHaveLength(0);
  });

  it("should refuse a low-contrast preset before writing anything", async () => {
    const faint = { ...ocean(), light: { ...ocean().light, mutedForeground: "#dddddd" } };
    await expect(store.updateTeamPreset("team-1", "preset-1", "user-1", { name: "Faint", theme: faint })).rejects.toThrow(/not valid/);
    expect(mocks.writes).toHaveLength(0);
  });

  it("should write only the team row and file no artifact version when the team default changes", async () => {
    mocks.reads.push([presetRow], [{ defaultTheme: null }]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(await store.setTeamDefaultTheme("team-1", "user-1", "team:brand-abc234")).toBe("team:brand-abc234");
    expect(writtenTables()).toEqual(["team", "team_theme_revision"]);
    expect(mocks.writes[0]?.values).toMatchObject({ defaultTheme: "team:brand-abc234", defaultThemeSetBy: "user-1" });
    expect(mocks.writes[1]?.values).toMatchObject({ teamId: "team-1", kind: "default", defaultTheme: "team:brand-abc234", createdBy: "user-1" });
    expect(info).toHaveBeenCalledWith("[themes] Team default theme changed", { teamId: "team-1", by: "user-1", from: null, to: "team:brand-abc234" });
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("should refuse another team's preset as the default without writing", async () => {
    mocks.reads.push([presetRow]);
    await expect(store.setTeamDefaultTheme("team-1", "user-1", "team:other-xyz789")).rejects.toThrow(/not one of the team's/);
    expect(mocks.writes).toHaveLength(0);
  });

  it("should leave artifacts untouched when a preset is deleted, clearing only the team default", async () => {
    mocks.reads.push([presetRow], [{ id: "team-1" }]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await store.deleteTeamPreset("team-1", "preset-1", "user-1");
    expect(writtenTables()).toEqual(["team_theme_preset", "team", "team_theme_revision"]);
    expect(mocks.writes.at(-1)?.values).toMatchObject({ kind: "default", defaultTheme: null });
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
    info.mockRestore();
  });
});

describe("team theme history", () => {
  const paper = presetTheme("paper");
  const revision = (theme: unknown) => ({ id: "rev-1", createdAt: new Date(), name: "Brand", theme, defaultTheme: null });

  it("should restore an older preset theme as a new save and a new revision, never rewriting the old one", async () => {
    mocks.reads.push([revision(paper)], [presetRow], [{ ...presetRow, theme: paper }]);
    const restored = await store.restorePresetRevision("team-1", "preset-1", "rev-1", "user-1");
    expect(restored.theme).toEqual(paper);
    expect(mocks.writes.map((write) => `${write.op} ${write.table}`)).toEqual(["update team_theme_preset", "insert team_theme_revision"]);
    expect(mocks.writes[0]?.values).toMatchObject({ name: "Brand", theme: paper, updatedBy: "user-1" });
    expect(mocks.writes[1]?.values).toMatchObject({ kind: "preset", presetId: "preset-1", theme: paper });
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
  });

  it("should refuse an old revision that fails today's contrast checks without writing", async () => {
    const faint = { ...ocean(), light: { ...ocean().light, mutedForeground: "#dddddd" } };
    mocks.reads.push([revision(faint)], [presetRow]);
    await expect(store.restorePresetRevision("team-1", "preset-1", "rev-1", "user-1")).rejects.toThrow(store.STALE_REVISION_MESSAGE);
    expect(mocks.writes).toHaveLength(0);
  });

  it("should refuse a revision that is not in this preset's history", async () => {
    mocks.reads.push([], [presetRow]);
    await expect(store.restorePresetRevision("team-1", "preset-1", "rev-x", "user-1")).rejects.toThrow(/no longer in the history/);
    expect(mocks.writes).toHaveLength(0);
  });

  it("should restore an earlier team default as a new change with its own revision", async () => {
    mocks.reads.push([{ ...revision(null), defaultTheme: "paper" }], [presetRow], [{ defaultTheme: "team:brand-abc234" }]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(await store.restoreDefaultRevision("team-1", "rev-1", "user-1")).toBe("paper");
    expect(mocks.writes.map((write) => `${write.op} ${write.table}`)).toEqual(["update team", "insert team_theme_revision"]);
    expect(mocks.writes[1]?.values).toMatchObject({ kind: "default", defaultTheme: "paper" });
    info.mockRestore();
  });

  it("should prune revisions past the runaway cap after a save, and nothing when under it", async () => {
    const revisions = await import("./team-theme-revisions");
    mocks.reads.push([], [{ id: "old-1" }, { id: "old-2" }]);
    await revisions.recordPresetRevision("team-1", { id: "preset-1", name: "Brand", theme: ocean() }, "user-1");
    expect(mocks.writes.map((write) => `${write.op} ${write.table}`)).toEqual(["insert team_theme_revision", "delete team_theme_revision"]);
    mocks.writes.length = 0;
    await revisions.recordDefaultRevision("team-1", "paper", "user-1");
    expect(mocks.writes.map((write) => `${write.op} ${write.table}`)).toEqual(["insert team_theme_revision"]);
  });

  it("should keep the save when the history write fails", async () => {
    mocks.reads.push([{ value: 3 }], [presetRow]);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.failInsertInto = "team_theme_revision";
    await expect(store.createTeamPreset("team-1", "user-1", { name: "Brand", theme: ocean() })).resolves.toMatchObject({ id: "preset-1" });
    expect(error).toHaveBeenCalledWith("[themes] Revision not recorded", "Error");
    mocks.failInsertInto = null;
    error.mockRestore();
  });
});
