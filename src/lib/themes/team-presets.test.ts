import type { Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { presetTheme } from "./resolve";

/*
 * Team presets in the database: changing presets or the team default is a
 * team setting, so it writes only team rows and never files an artifact
 * version. The database is a recording stand-in that answers each query
 * with the rows a test queues.
 */

const mocks = vi.hoisted(() => ({ writes: [] as { op: string; table: string; values: unknown }[], reads: [] as unknown[][], recordArtifactSave: vi.fn() }));

vi.mock("@/lib/versions/service", () => ({ recordArtifactSave: mocks.recordArtifactSave }));
vi.mock("@/db", async () => {
  const { getTableName: tableName } = await import("drizzle-orm");
  const nextRead = () => Promise.resolve(mocks.reads.shift() ?? []);
  const chain = (): unknown => new Proxy(() => undefined, { get: (_t, key) => (key === "then" ? (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => nextRead().then(resolve, reject) : chain()), apply: () => chain() });
  const write = (op: string) => (table: Table) => {
    const record = (values: unknown) => {
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
    expect(writtenTables()).toEqual(["team_theme_preset"]);
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
    expect(writtenTables()).toEqual(["team"]);
    expect(mocks.writes[0]?.values).toMatchObject({ defaultTheme: "team:brand-abc234", defaultThemeSetBy: "user-1" });
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
    expect(writtenTables()).toEqual(["team_theme_preset", "team"]);
    expect(mocks.recordArtifactSave).not.toHaveBeenCalled();
    info.mockRestore();
  });
});
