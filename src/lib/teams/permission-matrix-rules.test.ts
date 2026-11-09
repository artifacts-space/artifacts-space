import { describe, expect, it } from "vitest";

import { defaultActor, defaultRoleCapabilities, teamCapabilities, type TeamActor } from "./capability-rules";
import { grantableCapabilities, matrixCell, orderRoles, toggledCapabilities, type MatrixRole } from "./permission-matrix-rules";

const roleOf = (key: "owner" | "admin" | "member" | "agent"): MatrixRole => ({ key, name: key, builtIn: true, capabilities: defaultRoleCapabilities[key] });
const designer: MatrixRole = { key: "designer", name: "Designer", builtIn: false, capabilities: ["themes.manage"] };

describe("orderRoles", () => {
  it("should put Owner and Admin first, custom roles next, then Member and Agent", () => {
    expect(orderRoles([roleOf("agent"), roleOf("member"), designer, roleOf("owner"), roleOf("admin")]).map((role) => role.key)).toEqual(["owner", "admin", "designer", "member", "agent"]);
  });
});

describe("matrixCell", () => {
  it("should lock every Owner cell and show it as held", () => {
    for (const capability of teamCapabilities) {
      const cell = matrixCell(defaultActor("owner"), roleOf("owner"), capability);
      expect(cell.held).toBe(true);
      expect(cell.locked).toBeTypeOf("string");
    }
  });

  it("should lock approval cells for agents and show them as not held, even when a row says otherwise", () => {
    const agent: MatrixRole = { ...roleOf("agent"), capabilities: ["approve.sharing", "analytics.view"] };
    const approval = matrixCell(defaultActor("owner"), agent, "approve.sharing");
    expect(approval.held).toBe(false);
    expect(approval.locked).toBeTypeOf("string");
    expect(matrixCell(defaultActor("owner"), agent, "analytics.view")).toEqual({ held: true, locked: null, blocked: null });
  });

  it("should let an admin change Member cells for capabilities the admin holds", () => {
    expect(matrixCell(defaultActor("admin"), roleOf("member"), "approve.sharing")).toEqual({ held: false, locked: null, blocked: null });
  });

  it("should block an admin on the Admin column and on capabilities the admin lacks", () => {
    expect(matrixCell(defaultActor("admin"), roleOf("admin"), "approve.sharing").blocked).not.toBeNull();
    expect(matrixCell(defaultActor("admin"), roleOf("member"), "settings.sharing").blocked).not.toBeNull();
  });

  it("should block every cell when the viewer cannot change roles", () => {
    const viewers: (TeamActor | null)[] = [defaultActor("member"), defaultActor("agent"), null];
    for (const viewer of viewers) expect(matrixCell(viewer, designer, "themes.manage").blocked).not.toBeNull();
  });
});

describe("toggledCapabilities and grantableCapabilities", () => {
  it("should add and remove one capability in the canonical order", () => {
    expect(toggledCapabilities(designer, "share.team", true)).toEqual(["share.team", "themes.manage"]);
    expect(toggledCapabilities(designer, "themes.manage", false)).toEqual([]);
  });

  it("should offer only what the viewer holds when they may create roles", () => {
    expect(grantableCapabilities(defaultActor("admin"))).not.toContain("settings.sharing");
    expect(grantableCapabilities(defaultActor("owner"))).toEqual([...teamCapabilities]);
    expect(grantableCapabilities(defaultActor("member"))).toEqual([]);
  });
});
