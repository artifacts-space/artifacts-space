import { describe, expect, it } from "vitest";

import { actorCheckedTeamRoutes } from "./closed-team-routes";
import { teamRoutesClosedOverHttp, teamsPlugin } from "./teams-plugin";

/*
 * Better Auth's own role check lets the member role update, remove, invite,
 * and cancel (teams-plugin.ts), because a custom role sits on Better Auth's
 * member role. What keeps those grants out of reach is that every mutating
 * team route is either closed over HTTP or guarded by a hook that asks
 * `can`. A Better Auth upgrade that adds a route fails this test until
 * someone decides which it is.
 */

/** Mutating routes left open over HTTP on purpose, with what guards each. */
const reviewedOpenRoutes: Record<string, string> = {
  "/organization/create": "beforeCreateOrganization checks the slug and the team limit; the creator becomes owner.",
  "/organization/delete": "disableOrganizationDeletion turns it off.",
  "/organization/check-slug": "Reads only.",
  "/organization/has-permission": "Reads only (Better Auth's outer roles, never used for decisions).",
  "/organization/set-active": "Changes only the caller's own session.",
  "/organization/accept-invitation": "The invitee's own invitation; beforeAddMember refuses personal teams and agents.",
  "/organization/reject-invitation": "The invitee's own invitation.",
  "/organization/leave": "The caller's own membership; Better Auth and the team_keeps_an_owner trigger keep the last owner.",
};

interface Endpoint {
  path?: string;
  options?: { method?: string | string[] };
}

function mutatingPaths(): string[] {
  const endpoints: Record<string, Endpoint> = teamsPlugin().endpoints;
  return Object.values(endpoints).flatMap((endpoint) => {
    const methods = [endpoint.options?.method ?? []].flat();
    const mutates = methods.some((method) => method !== "GET");
    return mutates && endpoint.path ? [endpoint.path] : [];
  });
}

describe("team routes over HTTP", () => {
  it("should close or deliberately review every mutating team route", () => {
    const closed = new Set(teamRoutesClosedOverHttp);
    const unreviewed = mutatingPaths().filter((path) => !closed.has(path) && !(path in reviewedOpenRoutes));
    expect(unreviewed).toEqual([]);
  });

  it("should only close routes Better Auth still has, so a rename cannot reopen one silently", () => {
    const endpoints: Record<string, Endpoint> = teamsPlugin().endpoints;
    const paths = new Set(Object.values(endpoints).map((endpoint) => endpoint.path));
    expect(teamRoutesClosedOverHttp.filter((path) => !paths.has(path))).toEqual([]);
  });

  it("should close the routes that change members, roles, invitations, and settings", () => {
    expect(teamRoutesClosedOverHttp).toEqual(expect.arrayContaining([
      "/organization/invite-member",
      "/organization/cancel-invitation",
      "/organization/remove-member",
      "/organization/update-member-role",
      "/organization/update",
    ]));
  });

  it("should check the acting user's capability on role changes and removals, which are also closed over HTTP", () => {
    expect(actorCheckedTeamRoutes).toEqual({ "/organization/update-member-role": "members.roles", "/organization/remove-member": "members.remove" });
    for (const path of Object.keys(actorCheckedTeamRoutes)) expect(teamRoutesClosedOverHttp).toContain(path);
  });
});
