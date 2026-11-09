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

describe("changeMemberRole", () => {
  const change = { teamId: "team-1", memberId: "member-1", storedRole: "member" as const, roleId: "role-1", audit };

  beforeEach(() => {
    mocks.execute.mockResolvedValue({ rows: [{ found: true, changed: true }] });
  });

  it("should only touch a member and a custom role that both belong to the team", async () => {
    await store.changeMemberRole(change);
    const { text, params } = lastQuery();
    expect(text).toContain("where team_role.id = $1 and team_role.team_id = $2 and team_role.built_in = false");
    expect(text).toContain("where team_member.id = $3 and team_member.team_id = $4");
    expect(params.slice(0, 4)).toEqual(["role-1", "team-1", "member-1", "team-1"]);
  });

  it("should store the membership role, the assignment, and the audit row in one statement, with no repair step", async () => {
    await store.changeMemberRole(change);
    const { text, params } = lastQuery();
    expect(text).toMatch(/update team_member set role = \$\d+ from changed .* insert into team_role_assignment .* insert into team_permission_audit/);
    expect(params).toContain(JSON.stringify({ role: "Designer" }));
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("should write only when the stored role or the custom role differs from what the member has", async () => {
    await store.changeMemberRole(change);
    const { text } = lastQuery();
    expect(text).toContain("where prior.stored_role is distinct from $");
    expect(text).toContain("or prior.custom_role_id is distinct from $");
    expect(text).toContain("::jsonb from changed returning team_permission_audit.id");
  });

  it("should report no change when the member already had that role", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ found: true, changed: false }] });
    await expect(store.changeMemberRole(change)).resolves.toEqual({ changed: false });
  });

  it("should throw when the member or the role is not in the team, so nothing is applied silently", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ found: false, changed: false }] });
    await expect(store.changeMemberRole({ ...change, roleId: "role-other-team" })).rejects.toThrow("The role could not be changed.");
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

  it("should store the whole list only for a built-in role this statement inserted, never by guessing from the row", async () => {
    await store.setRoleCapability(input);
    const { text } = lastQuery();
    expect(text).not.toContain("xmax");
    expect(text).toMatch(/inserted as \( insert into team_role .* where \$\d+ and not exists \(select 1 from existing\) on conflict \(team_id, key\) do nothing/);
    expect(text).toContain("select existing.id, false as created from existing union all select inserted.id, true as created from inserted");
    expect(text).toContain("from role where role.created");
  });

  it("should never create a custom role that is gone", async () => {
    await store.setRoleCapability({ ...input, key: "designer", name: "Designer", builtIn: false });
    expect(lastQuery().params).toContain(false);
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
