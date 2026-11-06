import { IconPlus } from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { InvitationButtons } from "@/components/teams/invitation-buttons";
import { Section } from "@/components/teams/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { countMembers, listInvitationsForEmail, listTeamsForUser } from "@/lib/teams/queries";
import { roleLabel } from "@/lib/teams/roles";

export const metadata: Metadata = { title: "Teams" };
export const instant = false;

export default async function TeamsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [teams, invitations] = await Promise.all([listTeamsForUser(session.user.id), listInvitationsForEmail(session.user.email)]);
  const counts = await countMembers(teams.map((team) => team.id));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 py-8 sm:p-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium tracking-[-0.01em]">Teams</h1>
          <p className="mt-1 text-[13px] leading-6 text-muted-foreground">Share artifacts with a team. Your personal team is only you.</p>
        </div>
        <Button nativeButton={false} render={<Link href="/teams/new" />} className="px-3"><IconPlus /> Create a team</Button>
      </div>

      {invitations.length > 0 ? (
        <Section title="Invitations" description="Teams that invited you.">
          <ul>
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-3 border-b px-5 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{invitation.teamName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{invitation.inviterName} invited you as {roleLabel(invitation.role).toLowerCase()}.</p>
                </div>
                <InvitationButtons invitationId={invitation.id} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Your teams">
        <ul>
          {teams.map((team) => (
            <li key={team.id} className="border-b last:border-b-0">
              <Link href={`/teams/${team.slug}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/60">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{team.name}</span>
                {team.personal ? <Badge variant="secondary">Personal</Badge> : null}
                <span className="w-20 text-right text-xs text-muted-foreground">{roleLabel(team.role)}</span>
                <span className="w-24 text-right text-xs text-muted-foreground">{counts.get(team.id) ?? 0} {counts.get(team.id) === 1 ? "member" : "members"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
