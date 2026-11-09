import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The role store's writes are single statements, so each change and its
 * audit row land together or not at all. These tests render the SQL each
 * write sends (the database is the mocked boundary) and check that every
 * team check is qualified, so a column can never be compared with itself
 * (the correlated-subquery tripwire in AGENTS.md).
 */

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/db", () => ({ getDb: () => ({ execute: mocks.execute }) }));

const store = await import("./role-store");
const dialect = new PgDialect();

/** The SQL text and params of the last statement sent. */
function lastQuery() {
  const [statement] = mocks.execute.mock.lastCall as [SQL];
  const query = dialect.sqlToQuery(statement);
  return { text: query.sql.replace(/\s+/g, " "), params: query.params };
}

const audit = { actorId: "actor-1", action: "member_role_changed" as const, subject: "Lin", before: { role: "Member" }, after: { role: "Designer" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue({ rows: [{ id: "row-1" }] });
});

describe("recordMemberRole", () => {
  it("should only assign a role and a member that both belong to the team", async () => {
    await store.recordMemberRole({ teamId: "team-1", memberId: "member-1", roleId: "role-1", audit });
    const { text, params } = lastQuery();
    expect(text).toContain("where team_member.id = $1 and team_member.team_id = $2");
    expect(text).toContain("where team_role.id = $3 and team_role.team_id = $4");
    expect(params.slice(0, 4)).toEqual(["member-1", "team-1", "role-1", "team-1"]);
  });

  it("should write the audit row in the same statement as the assignment", async () => {
    await store.recordMemberRole({ teamId: "team-1", memberId: "member-1", roleId: "role-1", audit });
    const { text, params } = lastQuery();
    expect(text).toMatch(/insert into team_role_assignment .* insert into team_permission_audit/);
    expect(params).toContain(JSON.stringify({ role: "Designer" }));
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("should throw when nothing was written, so a role from another team is never applied silently", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(store.recordMemberRole({ teamId: "team-1", memberId: "member-1", roleId: "role-other-team", audit })).rejects.toThrow("The role could not be changed.");
  });
});

describe("restoreStoredRole", () => {
  it("should only touch the member in that team", async () => {
    await store.restoreStoredRole({ teamId: "team-1", memberId: "member-1", role: "admin" });
    const { text, params } = lastQuery();
    expect(text).toContain("where team_member.id = $2 and team_member.team_id = $3");
    expect(params).toEqual(["admin", "member-1", "team-1"]);
  });
});

describe("setRoleCapability", () => {
  const input = { teamId: "team-1", key: "member", name: "Member", builtIn: true, capability: "share.team" as const, on: true, next: ["share.team" as const, "analytics.view" as const], audit: { ...audit, action: "role_updated" as const } };

  it("should change only the one capability on a stored role, with its audit row in the same statement", async () => {
    await store.setRoleCapability(input);
    const { text } = lastQuery();
    expect(text).toContain("team_role_capability.capability = $");
    expect(text).toMatch(/delete from team_role_capability using role where team_role_capability.role_id = role.id/);
    expect(text).toContain("insert into team_permission_audit");
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("should log only a real change: a new role, an added cell, or a removed one", async () => {
    await store.setRoleCapability(input);
    expect(lastQuery().text).toContain("where role.created or exists (select 1 from added) or exists (select 1 from removed)");
  });

  it("should throw when the role could not be stored", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(store.setRoleCapability(input)).rejects.toThrow("The role could not be saved.");
  });
});

describe("deleteCustomRole", () => {
  it("should only delete a custom role of the team, and audit it in the same statement", async () => {
    await store.deleteCustomRole({ teamId: "team-1", key: "designer", audit: { ...audit, action: "role_deleted" as const } });
    const { text } = lastQuery();
    expect(text).toContain("where team_role.team_id = $1 and team_role.key = $2 and team_role.built_in = false");
    expect(text).toContain("insert into team_permission_audit");
  });

  it("should write a role change row for each person who had the role, in the same statement", async () => {
    await store.deleteCustomRole({ teamId: "team-1", key: "designer", audit: { ...audit, action: "role_deleted" as const, subject: "Designer" } });
    const { text } = lastQuery();
    expect(text).toContain("join team_role on team_role.id = team_role_assignment.role_id");
    expect(text).toContain("join team_member on team_member.id = team_role_assignment.member_id");
    expect(text).toContain("'member_role_changed', holders.name");
    expect(text).toContain("from holders where exists (select 1 from gone)");
  });

  it("should throw when the role was not there to delete", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(store.deleteCustomRole({ teamId: "team-1", key: "owner", audit: { ...audit, action: "role_deleted" as const } })).rejects.toThrow("That role does not exist in this team.");
  });
});

describe("createCustomRole", () => {
  it("should insert the role, its capabilities, and its audit row in one statement", async () => {
    await expect(store.createCustomRole({ teamId: "team-1", key: "designer", name: "Designer", capabilities: ["themes.manage"], audit: { ...audit, action: "role_created" as const } })).resolves.toBe("row-1");
    const { text } = lastQuery();
    expect(text).toMatch(/insert into team_role .* insert into team_role_capability .* insert into team_permission_audit/);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it.each(["owner", "admin", "member", "agent"])("should refuse a custom role keyed %s without writing anything", async (key) => {
    await expect(store.createCustomRole({ teamId: "team-1", key, name: key, capabilities: [], audit: { ...audit, action: "role_created" as const } })).rejects.toThrow("That name belongs to a built-in role.");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("should refuse a key the team already uses", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(store.createCustomRole({ teamId: "team-1", key: "designer", name: "Designer", capabilities: [], audit: { ...audit, action: "role_created" as const } })).rejects.toThrow("A role with that name already exists.");
  });
});
