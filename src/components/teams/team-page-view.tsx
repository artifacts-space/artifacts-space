import { Badge } from "@/components/ui/badge";
import type { TeamAgentView } from "@/lib/agents/queries";
import type { OpenReportView } from "@/lib/reports/service";
import type { PendingSharingView, TeamSharedView } from "@/lib/sharing/queries";
import type { PendingInvitationView, TeamMemberView, TeamMembership } from "@/lib/teams/queries";
import type { TeamRoleView } from "@/lib/teams/capabilities";
import { can } from "@/lib/teams/capability-rules";
import type { PermissionAuditView } from "@/lib/teams/role-store";
import { availableArtifactViews, availableTeamTabs, type ArtifactView, type TeamTab, type TeamTabAccess, type TeamTabSelection } from "@/lib/teams/team-tabs-rules";
import type { TeamThemeSettings } from "@/lib/themes/team-presets";
import { canManageTeamIcon } from "@/lib/teams/team-icon-rules";
import { canManageTeamThemes } from "@/lib/themes/team-preset-rules";
import type { PendingEditView } from "@/lib/versions/queries";

import { EditReviewList } from "./edit-reviews";
import { MembersTable } from "./members-table";
import { PendingSharingList } from "./pending-sharing";
import { PermissionsPanel } from "./permissions-panel";
import { ReportsList } from "./reports-list";
import { Section } from "./section";
import { SharedArtifactsTable } from "./shared-artifacts-table";
import { TeamIcon } from "./team-icon";
import { TeamIconControl } from "./team-icon-control";
import { TeamTabs, type TabPanel } from "./team-tabs";
import { TeamRuleNote } from "./team-rule-note";
import { TeamThemes } from "./team-themes";
import { LeaveTeamButton } from "./team-settings";

/** Everything the team page shows, loaded by the page (or a dev fixture) before it renders. */
export interface TeamPageData {
  team: TeamMembership;
  viewerId: string;
  origin: string;
  members: TeamMemberView[];
  agents: TeamAgentView[];
  invitations: PendingInvitationView[];
  shared: TeamSharedView[];
  requests: PendingSharingView[];
  edits: PendingEditView[];
  reports: OpenReportView[];
  themeNames: ReadonlyMap<string, string>;
  /** Null for personal teams, which have no themes. */
  themes: TeamThemeSettings | null;
  /** Every role in the team with its capabilities. */
  roles: TeamRoleView[];
  /** The newest role changes. */
  audit: PermissionAuditView[];
}

/** What the viewer may see, which decides the tabs and views. Reports show only while some are open. */
export function teamTabAccess(team: TeamMembership, openReports: number): TeamTabAccess {
  const reviews = !team.personal && (can(team, "approve.sharing") || can(team, "approve.edits"));
  return { personal: team.personal, reviews, reports: can(team, "reports.handle") && openReports > 0 };
}

function TeamHeader({ team }: { team: TeamMembership }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <TeamIcon name={team.name} iconUrl={team.iconUrl} size={48} className="text-lg" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-medium tracking-[-0.01em]">{team.name}</h1>
            {team.personal ? <Badge variant="secondary">Personal</Badge> : null}
          </div>
          <p className="mt-1 text-md text-muted-foreground">
            <span className="font-mono">/teams/{team.slug}</span> · You are {team.roleName.toLowerCase()}
          </p>
        </div>
      </div>
      {team.personal ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {canManageTeamIcon(team) ? <TeamIconControl teamId={team.id} teamName={team.name} iconUrl={team.iconUrl} /> : null}
          <LeaveTeamButton teamId={team.id} teamName={team.name} />
        </div>
      )}
    </div>
  );
}

function ApprovalPanel({ data }: { data: TeamPageData }) {
  return (
    <>
      {can(data.team, "approve.sharing") ? (
        <Section title="Sharing requests" description="Approve or deny requests to share with the team, by link, or in public.">
          <PendingSharingList requests={data.requests} />
        </Section>
      ) : null}
      {can(data.team, "approve.edits") ? (
        <Section title="Edits" description="Readers outside the team see the last approved version until you approve an edit.">
          <EditReviewList edits={data.edits} themeNames={data.themeNames} />
        </Section>
      ) : null}
    </>
  );
}

function artifactViewPanels(data: TeamPageData, views: ArtifactView[]): TabPanel<ArtifactView>[] {
  const withdraw = can(data.team, "artifacts.withdraw");
  const panels: Record<ArtifactView, TabPanel<ArtifactView>> = {
    shared: {
      id: "shared",
      content: (
        <Section title="Shared through this team" description={withdraw ? "Withdraw makes an artifact private to its author again." : undefined}>
          <SharedArtifactsTable artifacts={data.shared} canWithdraw={withdraw} />
        </Section>
      ),
    },
    approval: { id: "approval", count: data.requests.length + data.edits.length, content: <ApprovalPanel data={data} /> },
    reports: {
      id: "reports",
      count: data.reports.length,
      content: (
        <Section title="Reports" description="Readers reported these link or public artifacts. Withdraw sharing to take one down.">
          <ReportsList reports={data.reports} />
        </Section>
      ),
    },
  };
  return views.map((view) => panels[view]);
}

function tabPanels(data: TeamPageData, tabs: TeamTab[], approvals: number): TabPanel<TeamTab>[] {
  const { team } = data;
  const panels: Record<TeamTab, TabPanel<TeamTab>> = {
    members: {
      id: "members",
      content: <MembersTable viewer={team} members={data.members} agents={data.agents} invitations={data.invitations} roles={data.roles} origin={data.origin} />,
    },
    permissions: { id: "permissions", content: <PermissionsPanel team={team} roles={data.roles} audit={data.audit} /> },
    artifacts: { id: "artifacts", count: approvals, content: null },
    themes: {
      id: "themes",
      content: data.themes ? (
        <Section title="Themes" description="Give the team's artifacts one look. Readers outside the team see it on shared pages. Agents can use these presets but never change them.">
          <TeamThemes teamId={team.id} settings={data.themes} canManage={canManageTeamThemes(team)} />
        </Section>
      ) : null,
    },
  };
  return tabs.map((tab) => panels[tab]);
}

/**
 * The team page: a header with the team's name, URL, the viewer's role, and
 * Leave team, then tabs for members, permissions, shared artifacts, and
 * themes. `selection` comes from the URL, already checked against what the
 * viewer may see.
 */
export function TeamPageView({ data, selection }: { data: TeamPageData; selection: TeamTabSelection }) {
  const access = teamTabAccess(data.team, data.reports.length);
  const views = artifactViewPanels(data, availableArtifactViews(access));
  const approvals = access.reviews ? data.requests.length + data.edits.length : 0;
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 py-8 sm:p-6 sm:py-10">
      <TeamHeader team={data.team} />
      {data.team.personal || data.team.kind !== "person" ? null : <TeamRuleNote team={data.team} />}
      <TeamTabs tabs={tabPanels(data, availableTeamTabs(access), approvals)} views={views} initial={selection} />
    </main>
  );
}
