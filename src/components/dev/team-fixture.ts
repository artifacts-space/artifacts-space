import type { TeamPageData } from "@/components/teams/team-page-view";
import type { TeamAgentView } from "@/lib/agents/queries";
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

/** The fixture team page as a viewer with `role`; a personal team when `personal` is set. */
export function teamFixture(role: TeamRole, personal: boolean): TeamPageData {
  const manager = role !== "member";
  return {
    team: { id: "fixture-team", slug: "fixture", name: personal ? "Dev User" : "Fixture team", personal, teamSharingNeedsApproval: true, createdBy: viewerId, role, memberId: "fixture-member-viewer" },
    viewerId,
    origin: "http://localhost:3000",
    members: [
      { memberId: "fixture-member-viewer", userId: viewerId, name: "Dev User", email: "dev@example.com", username: "dev", role, joinedAt: at(1) },
      ...(personal ? [] : [
        { memberId: "fixture-member-ada", userId: "fixture-ada", name: "Ada Lovelace", email: "ada@example.com", username: "ada", role: "owner" as const, joinedAt: at(2) },
        { memberId: "fixture-member-grace", userId: "fixture-grace", name: "Grace Hopper", email: "grace@example.com", username: "grace", role: "admin" as const, joinedAt: at(3) },
        { memberId: "fixture-member-long", userId: "fixture-long", name: "Bartholomew Longname-Featherstonehaugh", email: "bartholomew.longname-featherstonehaugh@example.com", username: "bartholomew", role: "member" as const, joinedAt: at(4) },
      ]),
    ],
    agents: personal ? [] : [
      agentRow({ userId: "fixture-agent-reviewer", handle: "reviewer", name: "Code reviewer", tokens: [{ id: "fixture-token", name: "CI runner", prefix: "as_fx12", lastUsedAt: at(6), createdAt: at(2) }] }),
      agentRow({ userId: "fixture-agent-muted", handle: "scribe", name: "Meeting scribe", muted: true, ownerName: "Ada Lovelace" }),
      agentRow({ userId: "fixture-agent-handed", handle: "planner", name: "Release planner", ownerName: null, ownerInTeam: false, handedOver: true }),
    ],
    invitations: manager && !personal ? [
      { id: "fixture-invite-1", email: "new.teammate@example.com", role: "member", expiresAt: at(15) },
      { id: "fixture-invite-2", email: "lead@example.com", role: "admin", expiresAt: at(16) },
    ] : [],
    shared: [
      { artifactId: "fixture-shared-1", publicId: "fixtureteamshared0001", title: "Launch plan", icon: null, visibility: "team", authorId: viewerId, authorKind: "person", authorName: "Dev User", authorUsername: "dev", updatedAt: at(7), sharedAt: null },
      { artifactId: "fixture-shared-2", publicId: "fixtureteamshared0002", title: "A public write-up with a long title that has to truncate on phones", icon: null, visibility: "public", authorId: "fixture-agent-reviewer", authorKind: "agent", authorName: "Code reviewer", authorUsername: "reviewer", updatedAt: at(6), sharedAt: at(5) },
    ],
    requests: manager && !personal ? [
      { requestId: "fixture-request-1", kind: "sharing", comments: "team", artifactId: "fixture-req-a", publicId: "fixtureteamrequest001", title: "Incident review", icon: null, level: "public", currentVisibility: "team", requesterId: "fixture-agent-reviewer", requesterKind: "agent", requesterName: "Code reviewer", requesterUsername: "reviewer", requestedAt: at(7) },
      { requestId: "fixture-request-2", kind: "sharing", comments: null, artifactId: "fixture-req-b", publicId: "fixtureteamrequest002", title: "Roadmap", icon: null, level: "link", currentVisibility: "private", requesterId: "fixture-long", requesterKind: "person", requesterName: "Bartholomew Longname-Featherstonehaugh", requesterUsername: "bartholomew", requestedAt: at(8) },
    ] : [],
    edits: [],
    reports: manager ? [{ reportId: "fixture-report", artifactId: "fixture-shared-2", publicId: "fixtureteamshared0002", title: "A public write-up", icon: null, visibility: "public", reason: "spam", details: "Looks like an ad.", reportedAt: at(8) }] : [],
    themeNames: new Map(),
    themes: personal ? null : { presets: [], defaultTheme: null, defaultSetBy: null, defaultSetAt: null },
  };
}
