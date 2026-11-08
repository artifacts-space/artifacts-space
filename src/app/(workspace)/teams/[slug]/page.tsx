import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { EditReviewList } from "@/components/teams/edit-reviews";
import { InviteForm, PendingInvitations } from "@/components/teams/invite-form";
import { PendingSharingList, TeamSharedList } from "@/components/teams/pending-sharing";
import { ReportsList } from "@/components/teams/reports-list";
import { Section } from "@/components/teams/section";
import { TeamAgents } from "@/components/teams/team-agents";
import { TeamMembers } from "@/components/teams/team-members";
import { TeamThemes } from "@/components/teams/team-themes";
import { LeaveTeamButton, SharingRuleSetting } from "@/components/teams/team-settings";
import { Badge } from "@/components/ui/badge";
import { listTeamAgents } from "@/lib/agents/queries";
import { listOpenReports } from "@/lib/reports/service";
import { getSession } from "@/lib/session";
import { siteOrigin } from "@/lib/site-origin";
import { listPendingSharing, listTeamSharedArtifacts } from "@/lib/sharing/queries";
import { getTeamForMember, listPendingInvitations, listTeamMembers, type TeamMembership } from "@/lib/teams/queries";
import { canEditTeamSettings, canManageTeam, roleLabel } from "@/lib/teams/roles";
import { listPresetsForTeams, loadTeamThemeSettings } from "@/lib/themes/team-presets";
import { canManageTeamThemes } from "@/lib/themes/team-preset-rules";
import { listPendingEdits } from "@/lib/versions/queries";

export const metadata: Metadata = { title: "Team" };
export const instant = false;

function TeamHeader({ team }: { team: TeamMembership }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-medium tracking-[-0.01em]">{team.name}</h1>
          {team.personal ? <Badge variant="secondary">Personal</Badge> : null}
        </div>
        <p className="mt-1 text-md text-muted-foreground">
          <span className="font-mono">/teams/{team.slug}</span> · You are {roleLabel(team.role).toLowerCase()}
        </p>
      </div>
      {team.personal ? null : <LeaveTeamButton teamId={team.id} teamName={team.name} />}
    </div>
  );
}

/** Team presets and the team default. Only members reach this page (getTeamForMember), so only members ever see them. */
async function ThemesSection({ team }: { team: TeamMembership }) {
  const settings = await loadTeamThemeSettings(team.id);
  return (
    <Section title="Themes" description="Give the team's artifacts one look. Readers outside the team see it on shared pages. Agents can use these presets but never change them.">
      <TeamThemes teamId={team.id} settings={settings} canManage={canManageTeamThemes(team)} />
    </Section>
  );
}

/** Settings of a shared team: its themes and its sharing rule. Personal teams have neither. */
function SettingsSections({ team }: { team: TeamMembership }) {
  return (
    <>
      <ThemesSection team={team} />
      <Section title="Sharing rule" description="Does sharing with the team need an admin's approval?">
        <SharingRuleSetting teamId={team.id} needsApproval={team.teamSharingNeedsApproval} canEdit={canEditTeamSettings(team.role)} />
      </Section>
    </>
  );
}

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
 * Pending sharing and edits (owners and admins of shared teams), reader
 * reports (owners and admins of any team), and what the team shares.
 */
async function SharingSections({ team }: { team: TeamMembership }) {
  const manager = canManageTeam(team.role);
  const reviews = manager && !team.personal;
  const [requests, edits, reports, shared, themeNames] = await Promise.all([
    reviews ? listPendingSharing(team.id) : Promise.resolve([]),
    reviews ? listPendingEdits(team.id) : Promise.resolve([]),
    manager ? listOpenReports(team.id) : Promise.resolve([]),
    listTeamSharedArtifacts(team.id),
    teamPresetNames(team.id, reviews),
  ]);
  return (
    <>
      {manager && reports.length > 0 ? (
        <Section title="Reports" description="Readers reported these link or public artifacts. Withdraw sharing to take one down.">
          <ReportsList reports={reports} />
        </Section>
      ) : null}
      {reviews ? (
        <Section title="Pending sharing" description="Approve or deny requests to share with the team, by link, or in public.">
          <PendingSharingList requests={requests} />
        </Section>
      ) : null}
      {reviews ? (
        <Section title="Pending edits" description="Readers outside the team see the last approved version until you approve an edit.">
          <EditReviewList edits={edits} themeNames={themeNames} />
        </Section>
      ) : null}
      <Section title="Shared through this team" description={manager ? "Withdraw makes an artifact private to its author again." : undefined}>
        <TeamSharedList artifacts={shared} canWithdraw={manager} />
      </Section>
    </>
  );
}

export default async function TeamPage({ params }: PageProps<"/teams/[slug]">) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { slug } = await params;
  const team = await getTeamForMember(session.user.id, slug);
  if (!team) notFound();

  // Personal teams have one member and nothing to manage.
  const canManage = canManageTeam(team.role) && !team.personal;
  const [members, invitations, agents] = await Promise.all([
    listTeamMembers(team.id),
    canManage ? listPendingInvitations(team.id) : Promise.resolve([]),
    team.personal ? Promise.resolve([]) : listTeamAgents(team.id, canManage),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 py-8 sm:p-6 sm:py-10">
      <TeamHeader team={team} />

      <Section title="Members" description={team.personal ? "Your personal team is only you. Create a team to share with others." : undefined}>
        <TeamMembers teamId={team.id} members={members} viewerId={session.user.id} viewerRole={team.role} canManage={canManage} />
      </Section>

      {team.personal ? null : (
        <Section title="Agents" description="Agent teammates read what the team shares, comment, and answer @mentions with their own tokens. They can ask to share, never approve.">
          <TeamAgents teamId={team.id} agents={agents} canManage={canManage} origin={siteOrigin()} />
        </Section>
      )}

      <SharingSections team={team} />

      {canManage ? (
        <Section title="Invite people" description="They join when they accept the emailed invitation.">
          <InviteForm teamId={team.id} />
          <PendingInvitations teamId={team.id} invitations={invitations} />
        </Section>
      ) : null}

      {team.personal ? null : <SettingsSections team={team} />}
    </main>
  );
}
