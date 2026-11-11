import type { TeamPageData } from "@/components/teams/team-page-view";
import type { TeamAgentView } from "@/lib/agents/queries";
import type { TeamRoleView } from "@/lib/teams/capabilities";
import { builtInRoleKeys, builtInRoleNames, defaultActor, defaultRoleCapabilities } from "@/lib/teams/capability-rules";
import type { TeamMemberView } from "@/lib/teams/queries";
import type { TeamRole } from "@/lib/teams/roles";

/**
 * Data for /dev/team: a shared team with people, agents, open invitations,
 * shared artifacts, requests waiting for approval, and a report, so the
 * team page's tabs, dialogs, and phone layout can be checked without a
 * database. Nothing here is real; every email is under example.com.
 */

const at = (day: number) => new Date(Date.UTC(2026, 10, day, 12)).toISOString();

const viewerId = "fixture-viewer";

function agentRow(input: Partial<TeamAgentView> & Pick<TeamAgentView, "userId" | "handle" | "name">): TeamAgentView {
  return { ownerName: "Dev User", muted: false, createdAt: at(2), tokens: [], ownArtifacts: 0, ownerInTeam: true, handedOver: false, ...input };
}

/** The built-in roles with today's defaults, plus a custom Designer role. */
function fixtureRoles(): TeamRoleView[] {
  const builtIns = builtInRoleKeys.map((key) => ({ id: `role-${key}`, key, name: builtInRoleNames[key], builtIn: true, capabilities: [...defaultRoleCapabilities[key]] }));
  return [...builtIns, { id: "role-designer", key: "designer", name: "Designer", builtIn: false, capabilities: ["themes.manage", "analytics.view"] }];
}

function person(id: string, name: string, role: TeamRole, day: number, custom?: { key: string; name: string }): TeamMemberView {
  const handle = name.split(" ")[0]?.toLowerCase() ?? id;
  return { memberId: `fixture-member-${id}`, userId: `fixture-${id}`, name, email: `${handle}@example.com`, username: handle, role, roleKey: custom?.key ?? role, roleName: custom?.name ?? builtInRoleNames[role], joinedAt: at(day) };
}

function fixtureAudit(): TeamPageData["audit"] {
  return [
    { id: "fixture-audit-1", action: "role_created", subject: "Designer", actorName: "Ada Lovelace", before: [], after: ["themes.manage", "analytics.view"], createdAt: at(6) },
    { id: "fixture-audit-2", action: "member_role_changed", subject: "Lin Designer", actorName: "Ada Lovelace", before: ["Member"], after: ["Designer"], createdAt: at(7) },
  ];
}

/** The fixture team page as a viewer with `role`; a personal team when `personal` is set. */
export function teamFixture(role: TeamRole, personal: boolean): TeamPageData {
  const manager = role !== "member" && !personal;
  return {
    team: { id: "fixture-team", slug: "fixture", name: personal ? "Dev User" : "Fixture team", personal, teamSharingNeedsApproval: true, createdBy: viewerId, role, memberId: "fixture-member-viewer", userId: viewerId, ...defaultActor(role), roleName: builtInRoleNames[role], iconUrl: null },
    viewerId,
    origin: "http://localhost:3000",
    members: [
      { ...person("viewer", "Dev User", role, 1), userId: viewerId, email: "dev@example.com", username: "dev" },
      ...(personal ? [] : [
        person("ada", "Ada Lovelace", "owner", 2),
        person("grace", "Grace Hopper", "admin", 3),
        person("long", "Bartholomew Longname-Featherstonehaugh", "member", 4),
        person("lin", "Lin Designer", "member", 5, { key: "designer", name: "Designer" }),
      ]),
    ],
    agents: personal ? [] : [
      agentRow({ userId: "fixture-agent-reviewer", handle: "reviewer", name: "Code reviewer", tokens: [{ id: "fixture-token", name: "CI runner", prefix: "as_fx12", lastUsedAt: at(6), createdAt: at(2) }] }),
      agentRow({ userId: "fixture-agent-muted", handle: "scribe", name: "Meeting scribe", muted: true, ownerName: "Ada Lovelace" }),
      agentRow({ userId: "fixture-agent-handed", handle: "planner", name: "Release planner", ownerName: null, ownerInTeam: false, handedOver: true }),
    ],
    invitations: manager ? [
      { id: "fixture-invite-1", email: "new.teammate@example.com", role: "member", expiresAt: at(15), expired: false },
      { id: "fixture-invite-2", email: "lead@example.com", role: "admin", expiresAt: at(16), expired: false },
      { id: "fixture-invite-3", email: "late.reply@example.com", role: "member", expiresAt: at(1), expired: true },
    ] : [],
    shared: [
      { artifactId: "fixture-shared-1", publicId: "fixtureteamshared0001", title: "Launch plan", icon: null, visibility: "team", authorId: viewerId, authorKind: "person", authorName: "Dev User", authorUsername: "dev", updatedAt: at(7), sharedAt: null },
      { artifactId: "fixture-shared-2", publicId: "fixtureteamshared0002", title: "A public write-up with a long title that has to truncate on phones", icon: null, visibility: "public", authorId: "fixture-agent-reviewer", authorKind: "agent", authorName: "Code reviewer", authorUsername: "reviewer", updatedAt: at(6), sharedAt: at(5) },
    ],
    requests: manager ? [
      { requestId: "fixture-request-1", kind: "sharing", comments: "team", artifactId: "fixture-req-a", publicId: "fixtureteamrequest001", title: "Incident review", icon: null, level: "public", currentVisibility: "team", requesterId: "fixture-agent-reviewer", requesterKind: "agent", requesterName: "Code reviewer", requesterUsername: "reviewer", requestedAt: at(7) },
      { requestId: "fixture-request-2", kind: "sharing", comments: null, artifactId: "fixture-req-b", publicId: "fixtureteamrequest002", title: "Roadmap", icon: null, level: "link", currentVisibility: "private", requesterId: "fixture-long", requesterKind: "person", requesterName: "Bartholomew Longname-Featherstonehaugh", requesterUsername: "bartholomew", requestedAt: at(8) },
    ] : [],
    edits: [],
    reports: role !== "member" ? [{ reportId: "fixture-report", artifactId: "fixture-shared-2", publicId: "fixtureteamshared0002", title: "A public write-up", icon: null, visibility: "public", reason: "spam", details: "Looks like an ad.", reportedAt: at(8) }] : [],
    themeNames: new Map(),
    themes: personal ? null : { presets: [], defaultTheme: null, defaultSetBy: null, defaultSetAt: null },
    roles: fixtureRoles(),
    audit: personal ? [] : fixtureAudit(),
  };
}
