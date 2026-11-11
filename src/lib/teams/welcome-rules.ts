/**
 * When a member sees the welcome card in a team's workspace. Pure, so it is
 * tested without a database (welcome.ts reads the facts).
 *
 * The card is for people who joined someone else's team: it shows in that
 * team's workspace, where they can act on it, until they close it. It never
 * shows in a personal team, to the person who created the team, or to
 * someone who joined long ago, so existing members are not nagged.
 */

/** How long after joining the card can still show, if the member never closes it. */
export const TEAM_WELCOME_DAYS = 14;

const dayMs = 86_400_000;

/** What decides the card for one member of one team. */
export interface TeamWelcomeFacts {
  userId: string;
  personal: boolean;
  /** Who created the team; null when that account is gone. */
  createdBy: string | null;
  joinedAt: Date;
  /** The member closed the card in this team before. */
  dismissed: boolean;
}

/** Whether the member sees the welcome card in this team's workspace now. */
export function showTeamWelcome(facts: TeamWelcomeFacts, now: Date): boolean {
  if (facts.personal || facts.dismissed) return false;
  if (facts.createdBy === facts.userId) return false;
  return now.getTime() - facts.joinedAt.getTime() < TEAM_WELCOME_DAYS * dayMs;
}
