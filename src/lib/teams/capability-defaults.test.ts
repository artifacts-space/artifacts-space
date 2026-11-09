import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { builtInRoleKeys, defaultRoleCapabilities, teamCapabilities, type BuiltInRoleKey, type TeamCapability } from "./capability-rules";

/*
 * Today's rules, frozen from the read-only Permissions table that shipped
 * before roles became editable (one row per capability: owner, admin,
 * member, agent; "yes" means it happens without asking, "asks" means the
 * member asks first, "limited" means yes but never on owners). The backfill
 * and the defaults must reproduce it exactly, so no team loses or gains
 * anything when the migration runs.
 */
const todaysRules: Record<TeamCapability, [string, string, string, string]> = {
  "share.team": ["yes", "yes", "asks", "asks"],
  "share.link": ["yes", "yes", "asks", "asks"],
  "share.public": ["yes", "yes", "asks", "asks"],
  "approve.sharing": ["yes", "yes", "no", "no"],
  "approve.edits": ["yes", "yes", "no", "no"],
  "members.invite": ["yes", "yes", "no", "no"],
  "members.remove": ["yes", "limited", "no", "no"],
  "members.roles": ["yes", "limited", "no", "no"],
  "agents.manage": ["yes", "yes", "no", "no"],
  "themes.manage": ["yes", "yes", "no", "no"],
  "analytics.view": ["yes", "yes", "yes", "yes"],
  "artifacts.withdraw": ["yes", "yes", "no", "no"],
  "reports.handle": ["yes", "yes", "no", "no"],
  "settings.sharing": ["yes", "no", "no", "no"],
};

function heldToday(role: BuiltInRoleKey, capability: TeamCapability) {
  const grant = todaysRules[capability][builtInRoleKeys.indexOf(role)];
  return grant === "yes" || grant === "limited";
}

/** The (role, capability) pairs the backfill migration inserts. */
function backfilledPairs(): Set<string> {
  const migration = readFileSync(join(process.cwd(), "drizzle/0034_team_roles_backfill.sql"), "utf8");
  return new Set([...migration.matchAll(/\('(owner|admin|member|agent)', '([a-z.]+)'\)/g)].map((match) => `${match[1] ?? ""}:${match[2] ?? ""}`));
}

describe("default role capabilities", () => {
  it("should equal today's rules for every built-in role and capability", () => {
    for (const role of builtInRoleKeys) {
      for (const capability of teamCapabilities) {
        expect(defaultRoleCapabilities[role].includes(capability), `${role} ${capability}`).toBe(heldToday(role, capability));
      }
    }
  });

  it("should backfill exactly the defaults when the migration runs", () => {
    const expected = new Set(builtInRoleKeys.flatMap((role) => defaultRoleCapabilities[role].map((capability) => `${role}:${capability}`)));
    expect(backfilledPairs()).toEqual(expected);
  });

  it("should backfill only capabilities the code knows when the migration runs", () => {
    const known = new Set<string>(teamCapabilities);
    for (const pair of backfilledPairs()) expect(known.has(pair.split(":")[1] ?? "")).toBe(true);
  });
});
