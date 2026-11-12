import { UNDELIVERABLE_ADDRESS_CODE, undeliverableAddressMessage } from "@/lib/auth/undeliverable-address";

/**
 * Pure decisions for team invitations: what the invitation page shows, how a
 * new invitation relates to an open one, and which Better Auth refusals get
 * a plainer message. Client-safe.
 */

/** An invitation as the invitation page reads it, before any check. */
export interface InvitationFacts {
  email: string;
  status: string;
  expiresAt: Date;
}

/** Who opens the invitation page. */
export interface InvitationViewer {
  email: string;
  emailVerified: boolean;
  /** Whether the viewer is already in the invitation's team. */
  isMember: boolean;
}

/**
 * What the invitation page shows:
 * - `open`: join or decline.
 * - `verify`: the right address, but it is not confirmed yet, so Better Auth would refuse.
 * - `member`: the viewer is already in the team; open it.
 * - `other-email`: the invitation went to another address. Nothing about the team shows.
 * - `expired`, `used`, `canceled`, `declined`: closed, for the invited person.
 * - `missing`: no such invitation.
 */
export type InvitationPageState = "open" | "verify" | "member" | "other-email" | "expired" | "used" | "canceled" | "declined" | "missing";

const closedStates: Record<string, InvitationPageState> = { accepted: "used", canceled: "canceled", rejected: "declined" };

/**
 * Decides the invitation page. Membership comes first, so someone who is
 * already in the team is never stuck on a closed invitation. Only the person
 * the invitation is addressed to learns anything about the team or why it
 * closed; anyone else learns only that it went to another address.
 */
export function invitationPageState(invitation: InvitationFacts | null, viewer: InvitationViewer, now: Date): InvitationPageState {
  if (!invitation) return "missing";
  if (viewer.isMember) return "member";
  if (invitation.email.toLowerCase() !== viewer.email.toLowerCase()) return "other-email";
  const closed = closedStates[invitation.status];
  if (closed) return closed;
  if (invitation.status !== "pending") return "missing";
  if (invitation.expiresAt.getTime() <= now.getTime()) return "expired";
  return viewer.emailVerified ? "open" : "verify";
}

/**
 * Whether the invitation page may show the team, the inviter, and the role.
 * Members see their own team. Otherwise only someone who has confirmed the
 * invited address does: an unconfirmed account with a matching email has
 * not proved it owns that inbox, so it sees each state without team details.
 */
export function showsTeam(state: InvitationPageState, emailVerified: boolean): boolean {
  if (state === "member") return true;
  if (state === "other-email" || state === "missing" || state === "verify") return false;
  return emailVerified;
}

/**
 * How a new invitation relates to an open one for the same address:
 * - `new`: nothing open, so Better Auth creates one (its hooks check the role and the limits).
 * - `resend`: open at the same role, so the same link goes out again with a fresh expiry.
 *   Better Auth skips its create hooks here, so the caller must check the limits itself.
 * - `replace`: open at another role, so Better Auth cancels it and creates one at the new role.
 */
export type InviteMode = "new" | "resend" | "replace";

/** Decides the invite mode from the open invitation's role, or null when none is open. */
export function inviteMode(openRole: string | null, requestedRole: string): InviteMode {
  if (openRole === null) return "new";
  return openRole === requestedRole ? "resend" : "replace";
}

/**
 * A plainer message for Better Auth's invitation refusals, by its error
 * code, or null to keep the default one. `email` is the address the person
 * typed, never one read from the database.
 */
export function invitationRefusal(code: string | undefined, email = ""): string | null {
  switch (code) {
    case "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION":
      return email ? `${email} is already in this team.` : "That person is already in this team.";
    case "INVITATION_LIMIT_REACHED":
      return "This team has too many open invitations. Cancel some before you send more.";
    case "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED":
      return "This team is full. Ask an owner to make room, then try again.";
    case "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION":
      return "Confirm your email address first: sign in with an emailed link, then join.";
    case UNDELIVERABLE_ADDRESS_CODE:
      return undeliverableAddressMessage(code, email);
    case "INVITATION_NOT_FOUND":
    case "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION":
      return "This invitation is no longer open.";
    default:
      return null;
  }
}

/** How long the inviter keeps seeing an expired invitation, so they can send a new one. */
export const EXPIRED_INVITATION_DAYS = 30;

/** A team's workspace: its artifacts, where a new member lands and starts editing. */
export function teamWorkspacePath(slug: string) {
  return `/app?team=${encodeURIComponent(slug)}`;
}

/** An unanswered invitation as the inviter's list reads it. */
export interface ListedInvitation {
  email: string;
  createdAt: Date;
  expired: boolean;
}

/**
 * Which unanswered invitations the inviter sees, open ones first, each group
 * newest first. Every open invitation shows, so a second one to the same
 * address (two invites at once) can always be seen and canceled. An expired
 * one shows only while it is the newest invitation to that address in any
 * state (`newestByEmail`, keyed by lowercased address): a newer invitation,
 * or removing it, hides every older one instead of bringing the next back.
 */
export function visibleInvitations<T extends ListedInvitation>(rows: readonly T[], newestByEmail: ReadonlyMap<string, Date>): T[] {
  const newestFirst = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const open = newestFirst.filter((row) => !row.expired);
  const expired = newestFirst.filter((row) => row.expired && newestByEmail.get(row.email.toLowerCase())?.getTime() === row.createdAt.getTime());
  return [...open, ...expired];
}
