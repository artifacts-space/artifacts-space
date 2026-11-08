import type { SharingLevel } from "@/lib/artifact-types";

/** One team the requester belongs to, as the team choice needs it. */
export interface TeamChoiceMembership {
  id: string;
  slug: string;
  personal: boolean;
}

/** The team a sharing change goes through, or the message that says what to pass instead. */
export type TeamChoice = { ok: true; teamId: string } | { ok: false; error: string };

export const notAMemberError = "Team not found. You can share only with teams you belong to.";

function chosen(teamId: string): TeamChoice {
  return { ok: true, teamId };
}

/** Names the exact `team` values the requester can pass, so an agent can retry in one step. */
function passTeamError(level: SharingLevel, memberships: readonly TeamChoiceMembership[]): TeamChoice {
  const slugs = memberships.filter((item) => level !== "team" || !item.personal).map((item) => `"${item.slug}"`);
  if (slugs.length === 0) {
    return { ok: false, error: level === "team" ? "Choose a team to share with. You are not in a shared team yet." : "You are not in any team, so this artifact cannot be shared yet." };
  }
  return { ok: false, error: `Choose a team to share with: pass team as one of ${slugs.join(", ")} (from teams_list).` };
}

/**
 * Which team a sharing change goes through. A requested team is used only
 * when the requester belongs to it. With no team given, the artifact stays
 * in the team it is already shared through (when the requester is still a
 * member), so an agent can switch a team artifact to link without naming the
 * team. Link and public then fall back to the requester's personal team, and
 * then to their only team: agents have no personal team and belong to one.
 * The choice never decides approval; decideSharing does, and agents always wait.
 */
export function chooseSharingTeam(input: {
  level: SharingLevel;
  requestedTeamId: string | null | undefined;
  currentTeamId: string | null;
  memberships: readonly TeamChoiceMembership[];
}): TeamChoice {
  const { level, memberships } = input;
  const memberOf = (teamId: string | null | undefined) => (teamId ? memberships.find((item) => item.id === teamId) : undefined);
  if (input.requestedTeamId) {
    return memberOf(input.requestedTeamId) ? chosen(input.requestedTeamId) : { ok: false, error: notAMemberError };
  }
  const current = memberOf(input.currentTeamId);
  if (current && !(level === "team" && current.personal)) return chosen(current.id);
  if (level === "team") return passTeamError(level, memberships);
  const personal = memberships.find((item) => item.personal);
  if (personal) return chosen(personal.id);
  const [only, ...others] = memberships;
  if (only && others.length === 0) return chosen(only.id);
  return passTeamError(level, memberships);
}
