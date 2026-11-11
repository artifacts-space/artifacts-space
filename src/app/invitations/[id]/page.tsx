import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { AuthShell } from "@/components/auth/auth-shell";
import { InvitationView, type InvitationTeamView } from "@/components/teams/invitation-view";
import { getSession } from "@/lib/session";
import { getInvitationRecord, isInTeam, type InvitationRecord } from "@/lib/teams/invitation-queries";
import { invitationPageState, showsTeam } from "@/lib/teams/invitation-rules";

export const metadata: Metadata = { title: "Team invitation", robots: { index: false, follow: false } };
export const instant = false;

const idSchema = z.string().trim().min(1).max(200);

/** The invitation, or null for an id that cannot be one. */
async function loadInvitation(id: string): Promise<InvitationRecord | null> {
  const parsed = idSchema.safeParse(id);
  return parsed.success ? getInvitationRecord(parsed.data) : null;
}

function teamView(invitation: InvitationRecord | null): InvitationTeamView | null {
  if (!invitation) return null;
  return { teamName: invitation.teamName, teamSlug: invitation.teamSlug, inviterId: invitation.inviterId, inviterName: invitation.inviterName, role: invitation.role };
}

export default async function InvitationPage({ params }: PageProps<"/invitations/[id]">) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/invitations/${id}`)}`);
  const invitation = await loadInvitation(id);
  const isMember = invitation ? await isInTeam(session.user.id, invitation.teamId) : false;
  const state = invitationPageState(invitation, { email: session.user.email, emailVerified: session.user.emailVerified, isMember }, new Date());

  return (
    <AuthShell>
      <InvitationView invitationId={id} state={state} viewerEmail={session.user.email} team={showsTeam(state) ? teamView(invitation) : null} />
    </AuthShell>
  );
}
