import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { InviteForm, PendingInvitations } from "@/components/teams/invite-form";
import { Section } from "@/components/teams/section";
import { TeamMembers } from "@/components/teams/team-members";
import { LeaveTeamButton, SharingRuleSetting } from "@/components/teams/team-settings";
import { Badge } from "@/components/ui/badge";
import { getSession } from "@/lib/session";
import { getTeamForMember, listPendingInvitations, listTeamMembers, type TeamMembership } from "@/lib/teams/queries";
import { canEditTeamSettings, canManageTeam, roleLabel } from "@/lib/teams/roles";

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
        <p className="mt-1 text-[13px] text-muted-foreground">
          <span className="font-mono">/teams/{team.slug}</span> · You are {roleLabel(team.role).toLowerCase()}
        </p>
      </div>
      {team.personal ? null : <LeaveTeamButton teamId={team.id} teamName={team.name} />}
    </div>
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
  const [members, invitations] = await Promise.all([
    listTeamMembers(team.id),
    canManage ? listPendingInvitations(team.id) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 py-8 sm:p-6 sm:py-10">
      <TeamHeader team={team} />

      <Section title="Members" description={team.personal ? "Your personal team is only you. Create a team to share with others." : undefined}>
        <TeamMembers teamId={team.id} members={members} viewerId={session.user.id} viewerRole={team.role} canManage={canManage} />
      </Section>

      {canManage ? (
        <Section title="Invite people" description="They join when they accept the emailed invitation.">
          <InviteForm teamId={team.id} />
          <PendingInvitations teamId={team.id} invitations={invitations} />
        </Section>
      ) : null}

      {team.personal ? null : (
        <Section title="Sharing rule" description="Does sharing with the team need an admin's approval?">
          <SharingRuleSetting teamId={team.id} needsApproval={team.teamSharingNeedsApproval} canEdit={canEditTeamSettings(team.role)} />
        </Section>
      )}
    </main>
  );
}
