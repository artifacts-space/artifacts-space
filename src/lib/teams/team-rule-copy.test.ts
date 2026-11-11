import { describe, expect, it } from "vitest";

import { decideSharing } from "@/lib/sharing/rules";
import { decideEdit } from "@/lib/versions/rules";

import { defaultActor, defaultRoleCapabilities, type TeamActor } from "./capability-rules";
import { roleHint, teamRuleLines, teamWelcome, type TeamRuleSubject } from "./team-rule-copy";

const subject = (actor: TeamActor, teamSharingNeedsApproval: boolean): TeamRuleSubject => ({ ...actor, teamSharingNeedsApproval });
const member = defaultActor("member");
const admin = defaultActor("admin");
const team = (needsApproval: boolean) => ({ personal: false, teamSharingNeedsApproval: needsApproval });

describe("teamRuleLines", () => {
  it("should say members edit team artifacts directly whatever the sharing rule", () => {
    expect(teamRuleLines(subject(member, true)).inside).toMatch(/^Edit the team's artifacts directly/);
    expect(teamRuleLines(subject(member, false)).inside).toMatch(/no approval/);
  });

  it("should say sharing with the team is immediate when the team needs no approval", () => {
    expect(teamRuleLines(subject(member, false)).team).toMatch(/right away/);
    expect(decideSharing({ level: "team", team: team(false), member, actor: "person" })).toBe("apply");
  });

  it("should say a member needs approval to share with the team when the team asks for it", () => {
    expect(teamRuleLines(subject(member, true)).team).toMatch(/needs approval/);
    expect(decideSharing({ level: "team", team: team(true), member, actor: "person" })).toBe("pending");
  });

  it("should never tell a member they can share outside the team without approval", () => {
    const { outside } = teamRuleLines(subject(member, false));
    expect(outside).toMatch(/^Sharing by link or in public needs approval/);
    expect(outside).not.toMatch(/You can share/);
    expect(decideSharing({ level: "link", team: team(false), member, actor: "person" })).toBe("pending");
    expect(decideEdit({ visibility: "public", team: team(false), member, actor: "person" })).toBe("pending");
    expect(outside).toMatch(/once approved/);
  });

  it("should tell an admin they share outside right away when their role allows it", () => {
    expect(teamRuleLines(subject(admin, true)).outside).toBe("You can share by link or in public right away.");
    expect(decideSharing({ level: "public", team: team(true), member: admin, actor: "person" })).toBe("apply");
  });

  it("should name each level separately when a custom role may share only by link", () => {
    const linkOnly: TeamActor = { roleKey: "linker", kind: "person", capabilities: ["share.link"] };
    expect(teamRuleLines(subject(linkOnly, false)).outside).toMatch(/^You can share by link right away\. Sharing in public needs approval/);
  });
});

describe("teamWelcome", () => {
  it("should name approvers by permission, not only by built-in role, so custom approvers are covered", () => {
    expect(teamRuleLines(subject(member, true)).outside).toContain("someone who can approve sharing (owners and admins by default)");
  });

  it("should not claim other roles need approval beyond what the rule says when the viewer may share with the team", () => {
    const sharer: TeamActor = { roleKey: "sharer", kind: "person", capabilities: ["share.team"] };
    expect(teamRuleLines(subject(sharer, true)).team).toBe("Your role shares your own artifacts with the team right away. Roles without that permission need approval first.");
  });

  it("should welcome a member by team name and say edits need no approval but outside sharing does", () => {
    const welcome = teamWelcome("Northwind", subject(member, false));
    expect(welcome.title).toBe("Welcome to Northwind");
    expect(welcome.description).toMatch(/^You can edit the team's artifacts right away\. Sharing by link or in public needs approval/);
  });
});

describe("roleHint", () => {
  it("should describe the default Member as an editor who asks before sharing outside", () => {
    expect(roleHint(defaultRoleCapabilities.member)).toBe("Edits the team's artifacts and asks before sharing outside the team.");
  });

  it("should list an Admin's extra powers", () => {
    expect(roleHint(defaultRoleCapabilities.admin)).toBe("Edits the team's artifacts and shares by link and in public without asking. Also invites people, approves sharing, adds agents.");
  });

  it("should never say a link-only role shares in public without asking", () => {
    const hint = roleHint(["share.link"]);
    expect(hint).toBe("Edits the team's artifacts and shares by link without asking, and asks before sharing in public.");
    expect(decideSharing({ level: "public", team: team(false), member: { roleKey: "linker", kind: "person", capabilities: ["share.link"] }, actor: "person" })).toBe("pending");
  });
});
