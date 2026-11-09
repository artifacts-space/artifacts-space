import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { TeamPageView, teamTabAccess, type TeamPageData } from "@/components/teams/team-page-view";
import { listTeamAgents } from "@/lib/agents/queries";
import { listOpenReports } from "@/lib/reports/service";
import { getSession } from "@/lib/session";
import { siteOrigin } from "@/lib/site-origin";
import { listPendingSharing, listTeamSharedArtifacts } from "@/lib/sharing/queries";
import { getTeamAccessForMember, listPendingInvitations, listTeamMembers, type TeamAccess } from "@/lib/teams/queries";
import { can } from "@/lib/teams/capability-rules";
import { listPermissionAudit } from "@/lib/teams/role-store";
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

/** Loads a list only when the viewer's role allows it; otherwise an empty one. */
function when<T>(allowed: boolean, load: () => Promise<T[]>): Promise<T[]> {
  return allowed ? load() : Promise.resolve([]);
}

/**
 * Everything the tabs show, each list only for a role that may see it
 * (capability-rules.ts): invitations for "invite people", requests and edits
 * for their approvers, reports for "handle reports", agent tokens for
 * "add and remove agents". Only members reach this (getTeamAccessForMember),
 * and the roles come from that same load.
 */
async function loadTeamPage({ membership: team, roles }: TeamAccess, viewerId: string): Promise<TeamPageData> {
  const shared = !team.personal;
  const [members, invitations, agents, sharedArtifacts, requests, edits, reports, themeNames, themes, audit] = await Promise.all([
    listTeamMembers(team.id),
    when(shared && can(team, "members.invite"), () => listPendingInvitations(team.id)),
    when(shared, () => listTeamAgents(team.id, can(team, "agents.manage"))),
    listTeamSharedArtifacts(team.id),
    when(shared && can(team, "approve.sharing"), () => listPendingSharing(team.id)),
    when(shared && can(team, "approve.edits"), () => listPendingEdits(team.id)),
    when(can(team, "reports.handle"), () => listOpenReports(team.id)),
    teamPresetNames(team.id, shared && can(team, "approve.edits")),
    shared ? loadTeamThemeSettings(team.id) : Promise.resolve(null),
    // Not gated on purpose: everyone in the team may read who changed which roles, as they read the matrix.
    when(shared, () => listPermissionAudit(team.id)),
  ]);
  return { team, viewerId, origin: siteOrigin(), members, agents, invitations, shared: sharedArtifacts, requests, edits, reports, themeNames, themes, roles: [...roles.values()], audit };
}

export default async function TeamPage({ params, searchParams }: PageProps<"/teams/[slug]">) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const access = await getTeamAccessForMember(session.user.id, slug);
  if (!access) notFound();

  const data = await loadTeamPage(access, session.user.id);
  const selection = parseTeamTabs(query, teamTabAccess(access.membership, data.reports.length));
  return <TeamPageView data={data} selection={selection} />;
}
