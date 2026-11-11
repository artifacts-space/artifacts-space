import { can, type TeamActor, type TeamCapability } from "./capability-rules";

/**
 * The team's editing and sharing rule in plain words, for the person who
 * reads it. Pure and client-safe. It repeats what the real rules decide
 * (access-rules.ts canEditArtifact, sharing/rules.ts decideSharing,
 * versions/rules.ts decideEdit), so a change there needs a change here:
 *
 * - Inside the team, every member edits the team's artifacts directly.
 * - Sharing your own artifact with the team follows the team's sharing rule,
 *   unless your role may share with the team without asking.
 * - Sharing by link or in public needs approval, unless your role may share
 *   at that level without asking. Edits that readers outside the team see
 *   wait for someone who approves edits.
 */

/** A shared team as the viewer holds it: the team's sharing rule and the viewer's role. */
export interface TeamRuleSubject extends TeamActor {
  teamSharingNeedsApproval: boolean;
}

/** The rule as three short sentences: editing inside, sharing with the team, and sharing outside. */
export interface TeamRuleLines {
  inside: string;
  team: string;
  outside: string;
}

/** Who approves: anyone whose role holds "approve sharing", which custom roles can too. */
const approval = "approval from someone who can approve sharing (owners and admins by default)";

function teamLine(subject: TeamRuleSubject): string {
  if (!subject.teamSharingNeedsApproval) return "Share your own artifacts with the team right away. Everyone in the team can then edit them.";
  // Only the viewer's own role is known here, so the line never guesses what other roles may do.
  if (can(subject, "share.team")) return "Your role shares your own artifacts with the team right away. Roles without that permission need approval first.";
  return `Sharing your own artifacts with the team needs ${approval}.`;
}

function outsideLine(subject: TeamRuleSubject): string {
  const link = can(subject, "share.link");
  const open = can(subject, "share.public");
  const edits = can(subject, "approve.edits") ? "" : " Edits to those artifacts reach outside readers once approved.";
  if (link && open) return `You can share by link or in public right away.${edits}`;
  if (link) return `You can share by link right away. Sharing in public needs ${approval}.${edits}`;
  if (open) return `You can share in public right away. Sharing by link needs ${approval}.${edits}`;
  return `Sharing by link or in public needs ${approval}.${edits}`;
}

/** The team's rule for this viewer, in three sentences. */
export function teamRuleLines(subject: TeamRuleSubject): TeamRuleLines {
  return {
    inside: "Edit the team's artifacts directly. Your changes save at once, with no approval.",
    team: teamLine(subject),
    outside: outsideLine(subject),
  };
}

/** The short welcome a person sees after they join a team. */
export function teamWelcome(teamName: string, subject: TeamRuleSubject): { title: string; description: string } {
  return {
    title: `Welcome to ${teamName}`,
    description: `You can edit the team's artifacts right away. ${outsideLine(subject)}`,
  };
}

const extraPowers: readonly [TeamCapability, string][] = [
  ["members.invite", "invites people"],
  ["approve.sharing", "approves sharing"],
  ["agents.manage", "adds agents"],
];

/** How a role shares outside the team, naming each level exactly: a link-only role still asks before sharing in public. */
function outsideHint(actor: TeamActor): string {
  const link = can(actor, "share.link");
  const open = can(actor, "share.public");
  if (link && open) return "shares by link and in public without asking";
  if (link) return "shares by link without asking, and asks before sharing in public";
  if (open) return "shares in public without asking, and asks before sharing by link";
  return "asks before sharing outside the team";
}

/**
 * One line about what a role lets someone do, for the invitation's role
 * picker. Built from the role's capabilities, which an owner can change, so
 * it never promises more than the role holds.
 */
export function roleHint(capabilities: readonly TeamCapability[]): string {
  const actor: TeamActor = { roleKey: "invitee", kind: "person", capabilities };
  const powers = extraPowers.filter(([capability]) => can(actor, capability)).map(([, words]) => words);
  const also = powers.length > 0 ? ` Also ${powers.join(", ")}.` : "";
  return `Edits the team's artifacts and ${outsideHint(actor)}.${also}`;
}
