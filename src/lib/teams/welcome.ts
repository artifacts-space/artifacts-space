import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { team, teamMember } from "@/db/schema";
import { teamWelcomeDismissal } from "@/db/team-welcome-schema";

import { showTeamWelcome } from "./welcome-rules";

type Db = Pick<ReturnType<typeof getDb>, "select">;

/**
 * The facts behind one member's welcome card in one team: their membership,
 * the team, and whether they closed the card. Joins only, never correlated
 * subqueries (see AGENTS.md). Exported for its `.toSQL()` test.
 */
export function teamWelcomeQuery(db: Db, userId: string, teamId: string) {
  return db
    .select({ joinedAt: teamMember.createdAt, personal: team.personal, createdBy: team.createdBy, dismissedAt: teamWelcomeDismissal.createdAt })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .leftJoin(teamWelcomeDismissal, and(eq(teamWelcomeDismissal.userId, teamMember.userId), eq(teamWelcomeDismissal.teamId, teamMember.teamId)))
    .where(and(eq(teamMember.userId, userId), eq(teamMember.teamId, teamId)))
    .limit(1);
}

/** Whether this member sees the welcome card in this team's workspace now. False when they are not in the team. */
export async function shouldWelcome(userId: string, teamId: string, now = new Date()): Promise<boolean> {
  const [row] = await teamWelcomeQuery(getDb(), userId, teamId);
  if (!row) return false;
  return showTeamWelcome({ userId, personal: row.personal, createdBy: row.createdBy, joinedAt: row.joinedAt, dismissedAt: row.dismissedAt }, now);
}

/**
 * Closes the welcome card for this member of this team, on every device.
 * Returns false, saving nothing, when they are not in the team. Saving it
 * twice is harmless. A row from an earlier membership is moved to now, so
 * the close counts for the current one.
 */
export async function dismissTeamWelcome(userId: string, teamId: string): Promise<boolean> {
  const db = getDb();
  const [member] = await db
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(and(eq(teamMember.userId, userId), eq(teamMember.teamId, teamId)))
    .limit(1);
  if (!member) return false;
  await db
    .insert(teamWelcomeDismissal)
    .values({ userId, teamId })
    .onConflictDoUpdate({ target: [teamWelcomeDismissal.userId, teamWelcomeDismissal.teamId], set: { createdAt: sql`now()` } });
  return true;
}
