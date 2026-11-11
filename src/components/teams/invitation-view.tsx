import Link from "next/link";

import { PixelAvatar } from "@/components/pixel-avatar";
import { Button } from "@/components/ui/button";
import { teamWorkspacePath, type InvitationPageState } from "@/lib/teams/invitation-rules";
import { roleLabel, type TeamRole } from "@/lib/teams/roles";

import { InvitationButtons } from "./invitation-buttons";
import { SwitchAccountButton } from "./switch-account-button";

/** The team and inviter, passed only when the page may show them (invitation-rules.ts showsTeam). */
export interface InvitationTeamView {
  teamName: string;
  teamSlug: string;
  inviterId: string;
  inviterName: string;
  role: TeamRole;
}

export interface InvitationViewProps {
  invitationId: string;
  state: InvitationPageState;
  /** The signed-in address, so a wrong-account visitor sees which account they used. */
  viewerEmail: string;
  team: InvitationTeamView | null;
}

const invitationPath = (id: string) => `/invitations/${encodeURIComponent(id)}`;

const teamsLink = <Link href="/teams" className="text-sm underline underline-offset-4">Go to your teams</Link>;

function Heading({ children }: { children: React.ReactNode }) {
  return <h1 className="text-2xl font-medium tracking-[-0.015em]">{children}</h1>;
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 mb-8 text-md leading-6 text-muted-foreground">{children}</p>;
}

function Inviter({ team }: { team: InvitationTeamView }) {
  return <><PixelAvatar seed={team.inviterId} size={20} className="mr-1.5 -mt-0.5" />{team.inviterName}</>;
}

function OpenInvitation({ invitationId, team }: { invitationId: string; team: InvitationTeamView }) {
  return (
    <>
      <Heading>Join {team.teamName}</Heading>
      <Body>
        <Inviter team={team} /> invited you as {roleLabel(team.role).toLowerCase()}. You can edit the team&apos;s artifacts as soon as you join, with no approval needed inside the team.
      </Body>
      <InvitationButtons invitationId={invitationId} />
    </>
  );
}

/** Sentences for the invitation states that end the flow. Without team details they still say what happened and what to do. */
function closedCopy(state: InvitationPageState, team: InvitationTeamView | null): { title: string; body: React.ReactNode } | null {
  const who = team ? <Inviter team={team} /> : "the person who invited you";
  const teamName = team ? team.teamName : "the team";
  switch (state) {
    case "expired":
      return { title: "This invitation expired", body: <>{team ? <>{who} invited you to {teamName}, but the</> : "The"} link stopped working after 7 days. Ask {team ? "them" : who} to send a new one.</> };
    case "used":
      return { title: "This invitation was already used", body: <>Each invitation joins {teamName} once. If you left the team, ask {who} for a new one.</> };
    case "canceled":
      return { title: "This invitation was canceled", body: <>Ask {who} for a new one if you still want to join {teamName}.</> };
    case "declined":
      return { title: "You declined this invitation", body: <>Ask {who} for a new one if you change your mind about {teamName}.</> };
    default:
      return null;
  }
}

function MemberState({ team }: { team: InvitationTeamView }) {
  return (
    <>
      <Heading>You are already in {team.teamName}</Heading>
      <Body>Open the team&apos;s artifacts to keep working. You can edit them directly.</Body>
      <Button size="sm" nativeButton={false} render={<Link href={teamWorkspacePath(team.teamSlug)} />}>Open {team.teamName}</Button>
    </>
  );
}

/** The address matches but is not confirmed: no team details until the person proves the inbox is theirs. */
function VerifyState({ invitationId, viewerEmail }: { invitationId: string; viewerEmail: string }) {
  return (
    <>
      <Heading>Confirm your email to see this invitation</Heading>
      <Body>This account has not confirmed {viewerEmail} yet. Sign in with an emailed link to that address, and you come back here to join.</Body>
      <SwitchAccountButton returnTo={invitationPath(invitationId)} label="Sign in with an email link" />
    </>
  );
}

function OtherEmailState({ invitationId, viewerEmail }: { invitationId: string; viewerEmail: string }) {
  return (
    <>
      <Heading>This invitation is for another email address</Heading>
      <Body>You are signed in as {viewerEmail}. Sign in with the address the invitation went to, and you come back here to join.</Body>
      <div className="flex flex-wrap items-center gap-4">
        <SwitchAccountButton returnTo={invitationPath(invitationId)} label="Sign in with another email" />
        {teamsLink}
      </div>
    </>
  );
}

function MissingState({ viewerEmail }: { viewerEmail: string }) {
  return (
    <>
      <Heading>We could not find this invitation</Heading>
      <Body>Check the link in your email. You are signed in as {viewerEmail}.</Body>
      {teamsLink}
    </>
  );
}

function StateContent(props: InvitationViewProps) {
  const { state, team, invitationId, viewerEmail } = props;
  if (state === "open" && team) return <OpenInvitation invitationId={invitationId} team={team} />;
  if (state === "member" && team) return <MemberState team={team} />;
  if (state === "open" || state === "verify") return <VerifyState invitationId={invitationId} viewerEmail={viewerEmail} />;
  if (state === "other-email") return <OtherEmailState invitationId={invitationId} viewerEmail={viewerEmail} />;
  const closed = closedCopy(state, team);
  if (!closed) return <MissingState viewerEmail={viewerEmail} />;
  return (
    <>
      <Heading>{closed.title}</Heading>
      <Body>{closed.body}</Body>
      {teamsLink}
    </>
  );
}

/**
 * The invitation page's content for every state (invitation-rules.ts). Team
 * details come only when the page passes them (showsTeam): to a member, or
 * to the invited person once their address is confirmed. Everyone else
 * still learns what happened and gets the way on, such as switching
 * accounts and coming back here.
 */
export function InvitationView(props: InvitationViewProps) {
  return <div className="w-full max-w-[400px]"><StateContent {...props} /></div>;
}
