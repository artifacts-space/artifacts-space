import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { TeamPageView, teamTabAccess, type TeamPageData } from "@/components/teams/team-page-view";
import { listTeamAgents } from "@/lib/agents/queries";
import { listOpenReports } from "@/lib/reports/service";
import { getSession } from "@/lib/session";
import { siteOrigin } from "@/lib/site-origin";
import { listPendingSharing, listTeamSharedArtifacts } from "@/lib/sharing/queries";
import { getTeamForMember, listPendingInvitations, listTeamMembers, type TeamMembership } from "@/lib/teams/queries";
import { canManageTeam } from "@/lib/teams/roles";
import { parseTeamTabs } from "@/lib/teams/team-tabs-rules";
import { listPresetsForTeams, loadTeamThemeSettings } from "@/lib/themes/team-presets";
import { listPendingEdits } from "@/lib/versions/queries";

export const metadata: Metadata = { title: "Team" };
export const instant = false;

/** The team's preset names by id for reviewers, so pending theme changes read "Brand", not "Team preset". A failed lookup keeps the generic label. */
async function teamPresetNames(teamId: string, reviews: boolean): Promise<Map<string, string>> {
  if (!reviews) return new Map();
  try {
    const presets = (await listPresetsForTeams([teamId])).get(teamId) ?? [];
    return new Map(presets.map((preset) => [preset.ref, preset.name]));
  } catch (error) {
    console.error("[themes] Preset names failed", error instanceof Error ? error.name : "unknown error");
    return new Map();
  }
}

/**
 * Everything the tabs show. Pending sharing and edits load for owners and
 * admins of shared teams, invitations and reports for owners and admins, and
 * themes for shared teams. Only members reach this (getTeamForMember).
 */
async function loadTeamPage(team: TeamMembership, viewerId: string): Promise<TeamPageData> {
  const manager = canManageTeam(team.role);
  const canManage = manager && !team.personal;
  const [members, invitations, agents, shared, requests, edits, reports, themeNames, themes] = await Promise.all([
    listTeamMembers(team.id),
    canManage ? listPendingInvitations(team.id) : Promise.resolve([]),
    team.personal ? Promise.resolve([]) : listTeamAgents(team.id, canManage),
    listTeamSharedArtifacts(team.id),
    canManage ? listPendingSharing(team.id) : Promise.resolve([]),
    canManage ? listPendingEdits(team.id) : Promise.resolve([]),
    manager ? listOpenReports(team.id) : Promise.resolve([]),
    teamPresetNames(team.id, canManage),
    team.personal ? Promise.resolve(null) : loadTeamThemeSettings(team.id),
  ]);
  return { team, viewerId, origin: siteOrigin(), members, agents, invitations, shared, requests, edits, reports, themeNames, themes };
}

export default async function TeamPage({ params, searchParams }: PageProps<"/teams/[slug]">) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const team = await getTeamForMember(session.user.id, slug);
  if (!team) notFound();

  const data = await loadTeamPage(team, session.user.id);
  const selection = parseTeamTabs(query, teamTabAccess(team, data.reports.length));
  return <TeamPageView data={data} selection={selection} />;
}
