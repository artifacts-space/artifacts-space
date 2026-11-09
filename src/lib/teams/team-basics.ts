import { eq } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db";
import { team } from "@/db/schema";

/** A team's name, whether it is someone's personal team, and its default artifact theme. */
export interface TeamBasics {
  name: string;
  personal: boolean;
  defaultTheme: string | null;
}

/**
 * One team's basics by id, or null when it is gone. Deduplicated per request,
 * so an artifact page reads its team once for the byline, the theme (page
 * and link preview tags), and the theme picker. Callers decide who may see
 * which field: only members are shown the name.
 */
export const loadTeamBasics = cache(async (teamId: string): Promise<TeamBasics | null> => {
  const [row] = await getDb().select({ name: team.name, personal: team.personal, defaultTheme: team.defaultTheme }).from(team).where(eq(team.id, teamId)).limit(1);
  return row ?? null;
});
