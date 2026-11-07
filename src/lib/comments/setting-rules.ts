import type { ArtifactVisibility, CommentSetting } from "@/lib/artifact-types";
import { decideSharing, type SharingActor, type SharingOutcome, type SharingTeamRule } from "@/lib/sharing/rules";
import { canManageTeam, type TeamRole } from "@/lib/teams/roles";

/**
 * Pure rules for an artifact's comments setting: who sees and writes its
 * comments, the default for new artifacts and sharing changes, who may
 * change it, and when opening it up needs approval. Client-safe: the Share
 * dialog uses the same rules the server enforces.
 */

/** Who is looking at a thread, relative to one artifact. */
export interface CommentViewer {
  /** The viewer can read the artifact (the one access check decided). */
  canViewArtifact: boolean;
  isAuthor: boolean;
  /** Member of the artifact's own team. */
  isTeamMember: boolean;
}

/**
 * Whether a signed-in viewer sees and writes an artifact's comments. off:
 * nobody (the comments are kept, hidden). team: the author and members of
 * the artifact's team. signed_in: anyone signed in who can read it. Signed-out
 * readers never use comments, so callers pass only signed-in viewers.
 */
export function canSeeComments(setting: CommentSetting, viewer: CommentViewer): boolean {
  if (!viewer.canViewArtifact || setting === "off") return false;
  if (setting === "signed_in") return true;
  return viewer.isAuthor || viewer.isTeamMember;
}

/** The message for a viewer who can read the artifact but not its comments. */
export function hiddenCommentsMessage(setting: CommentSetting): string {
  if (setting === "off") return "Comments are off for this artifact.";
  return "Only the author and members of the artifact's team can read and write its comments.";
}

/**
 * The setting for a new artifact, or for a sharing change that moves it to
 * another team: comments stay within a shared team (team), and stay off on
 * link and public artifacts in a personal team, where "the team" is only the
 * author. Private artifacts keep comments to their author.
 */
export function defaultCommentSetting(input: { visibility: ArtifactVisibility; teamPersonal: boolean | null }): CommentSetting {
  const outsideReaders = input.visibility === "link" || input.visibility === "public";
  if (outsideReaders && input.teamPersonal !== false) return "off";
  return "team";
}

/**
 * The setting after a sharing change: what the person asked for; otherwise
 * the current setting when the artifact stays in the same team or turns
 * private; otherwise the default for the new level and team.
 */
export function commentsAfterSharing(input: {
  current: CommentSetting;
  requested: CommentSetting | undefined;
  sameTeam: boolean;
  next: { visibility: ArtifactVisibility; teamPersonal: boolean | null };
}): CommentSetting {
  if (input.requested) return input.requested;
  if (input.next.visibility === "private" || input.sameTeam) return input.current;
  return defaultCommentSetting(input.next);
}

/**
 * Whether moving to `next` opens comments in a shared team to anyone signed
 * in: the same widening as public sharing. Keeping signed_in in the same team
 * was approved before, so it is not a widening. Artifacts without a team or
 * in a personal team never need approval.
 */
export function opensCommentsInTeam(input: { current: CommentSetting; next: CommentSetting; sameTeam: boolean; team: SharingTeamRule | null }): boolean {
  if (input.next !== "signed_in" || !input.team || input.team.personal) return false;
  return !(input.sameTeam && input.current === "signed_in");
}

/**
 * Applies now, or waits for an owner or admin: opening comments in a shared
 * team to anyone signed in follows the public sharing rule (owners and admins
 * apply it themselves; members and agents wait). Narrowing always applies.
 */
export function decideCommentSetting(input: {
  current: CommentSetting;
  next: CommentSetting;
  sameTeam: boolean;
  team: SharingTeamRule | null;
  role: TeamRole | null;
  actor: SharingActor;
}): SharingOutcome {
  if (!input.team || !opensCommentsInTeam(input)) return "apply";
  return decideSharing({ level: "public", team: input.team, role: input.role ?? "member", actor: input.actor });
}

/**
 * Who may change the setting: the author, and owners and admins of the
 * artifact's shared team (people only; agents act as members).
 */
export function canChangeCommentSetting(input: { viewerId: string; authorId: string; viewerRole: TeamRole | null; teamPersonal: boolean | null; actor: SharingActor }): boolean {
  if (input.viewerId === input.authorId) return true;
  if (input.actor !== "person" || input.teamPersonal !== false || input.viewerRole === null) return false;
  return canManageTeam(input.viewerRole);
}
