import { describe, expect, it, vi } from "vitest";

/*
 * Who a snapshot of an artifact row is credited to (snapshotSource): the
 * row's own `person_saved_at` says whether its newest save was a person's.
 * The database is never reached.
 */

vi.mock("@/db", () => ({ getDb: vi.fn() }));

const { snapshotSource } = await import("./history");

const savedAt = new Date("2026-11-11T13:08:00.123Z");

describe("snapshotSource", () => {
  it("should credit the person, with no harness, when the row's newest save was a person's", () => {
    expect(snapshotSource({ personSavedAt: savedAt, updatedAt: savedAt, harness: "claude-code" })).toEqual({ byAgent: false, harness: null });
  });

  it("should credit the agent with the row's harness when an agent saved after the person", () => {
    expect(snapshotSource({ personSavedAt: new Date(savedAt.getTime() - 5), updatedAt: savedAt, harness: "claude-code" })).toEqual({ byAgent: true, harness: { harness: "claude-code", label: null } });
  });

  it("should leave it unknown for a row from before person_saved_at, so History reads the harness", () => {
    expect(snapshotSource({ personSavedAt: null, updatedAt: savedAt, harness: null })).toEqual({ byAgent: null, harness: null });
  });
});
