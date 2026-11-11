import type { TeamMembership } from "@/lib/teams/queries";

import type { ShareTeam } from "./share-teams-context";

/**
 * The viewer's teams as the share controls need them (ShareTeamsProvider),
 * personal team first as listTeamsForUser returns them. Used by /app and by
 * the artifact page, for people who may share.
 */
export function toShareTeams(memberships: readonly TeamMembership[]): ShareTeam[] {
  return memberships.map(({ id, slug, name, personal, role, roleKey, kind, capabilities, teamSharingNeedsApproval, iconUrl }) => ({ id, slug, name, personal, role, roleKey, kind, capabilities, teamSharingNeedsApproval, iconUrl }));
}
