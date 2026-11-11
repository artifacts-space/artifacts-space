import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { InvitationView } from "@/components/teams/invitation-view";
import { showsTeam, type InvitationPageState } from "@/lib/teams/invitation-rules";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Invitation fixture",
  robots: { index: false, follow: false },
};

const states: readonly InvitationPageState[] = ["open", "verify", "member", "other-email", "expired", "used", "canceled", "declined", "missing"];

function stateFrom(value: string | string[] | undefined): InvitationPageState {
  return states.find((state) => state === value) ?? "open";
}

/**
 * Development-only page for the invitation e2e test: the real invitation
 * page content for each state (`?state=`), with fixture data and no
 * database. Returns 404 in every other environment.
 */
export default async function InvitationFixturePage({ searchParams }: PageProps<"/dev/invitation">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const state = stateFrom((await searchParams).state);
  const team = { teamName: "Northwind Studio", teamSlug: "northwind", inviterId: "fixture-inviter", inviterName: "Dana Reyes", role: "member" as const };
  return (
    <AuthShell>
      <InvitationView invitationId="fixture-invitation" state={state} viewerEmail="sam.longaddress@example.com" team={showsTeam(state) ? team : null} />
    </AuthShell>
  );
}
