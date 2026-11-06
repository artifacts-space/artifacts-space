import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { InvitationButtons } from "@/components/teams/invitation-buttons";
import { getSession } from "@/lib/session";
import { getInvitationForEmail } from "@/lib/teams/queries";
import { roleLabel } from "@/lib/teams/roles";

export const metadata: Metadata = { title: "Team invitation", robots: { index: false, follow: false } };
export const instant = false;

export default async function InvitationPage({ params }: PageProps<"/invitations/[id]">) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/invitations/${id}`)}`);
  const invitation = await getInvitationForEmail(id, session.user.email);

  return (
    <AuthShell>
      <div className="w-full max-w-[400px]">
        {invitation ? (
          <>
            <h1 className="text-2xl font-medium tracking-[-0.015em]">Join {invitation.teamName}</h1>
            <p className="mt-2 mb-8 text-sm leading-6 text-muted-foreground">
              {invitation.inviterName} invited you as {roleLabel(invitation.role).toLowerCase()}. You will see the artifacts the team shares.
            </p>
            <InvitationButtons invitationId={invitation.id} />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-medium tracking-[-0.015em]">This invitation is not open</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              It may have expired, been used, or been sent to another email address. You are signed in as {session.user.email}.
            </p>
            <Link href="/teams" className="mt-6 inline-block text-[13px] underline underline-offset-4">Go to your teams</Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
