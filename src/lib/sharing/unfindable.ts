import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";

/**
 * The safety net for "every artifact has one home" (#219): rows that no
 * signed-in person can find in a workspace, which must never exist. A
 * workspace lists an artifact (src/lib/artifact-list-scope.ts) when
 * - Personal: a person wrote it, or acts for the agent that wrote it (they
 *   added the agent and are still in its team), and its home is not one of
 *   that person's shared teams; or
 * - a team's workspace: it is shared through a shared team (any level but
 *   private) that has a person in it.
 * People are users with no agent row. Agents never sign in to the web app.
 * A `team` artifact with no team is listed too even when its author can
 * still see it: that is the row a team deletion leaves without the
 * hand-back (AGENTS.md, "When an author and a home come apart").
 *
 * Every column is qualified with an alias of its own, so the correlated
 * subqueries cannot fall into the single-table tripwire (AGENTS.md).
 */

const unfindableRow = z.object({ id: z.string(), publicId: z.string(), reason: z.enum(["team_without_team", "in_no_workspace"]) });

/** An artifact no signed-in person can find in a workspace, and why. */
export type UnfindableArtifact = z.infer<typeof unfindableRow>;

/** The statement, exported so its text can be read in a test without a database. */
export function unfindableArtifactsStatement() {
  return sql`
    select a.id, a.public_id as "publicId",
      case when a.visibility = 'team' and a.team_id is null then 'team_without_team' else 'in_no_workspace' end as reason
    from artifact a
    where (a.visibility = 'team' and a.team_id is null)
      or (
        not exists (
          select 1 from team_member tm
          join team t on t.id = tm.team_id
          left join agent tm_agent on tm_agent.user_id = tm.user_id
          where tm.team_id = a.team_id and a.visibility <> 'private' and t.personal = false and tm_agent.user_id is null
        )
        and not exists (
          select 1 from "user" p
          left join agent p_agent on p_agent.user_id = p.id
          where p_agent.user_id is null
            and (
              p.id = a.user_id
              or exists (
                select 1 from agent author_agent
                join team_member owner_member on owner_member.team_id = author_agent.team_id and owner_member.user_id = author_agent.owner_id
                where author_agent.user_id = a.user_id and author_agent.owner_id = p.id
              )
            )
            and (
              a.visibility = 'private' or a.team_id is null
              or not exists (
                select 1 from team_member home_member
                join team home on home.id = home_member.team_id
                where home_member.user_id = p.id and home_member.team_id = a.team_id and home.personal = false
              )
            )
        )
      )
    order by a.id
  `;
}

/** Every artifact no signed-in person can find in a workspace. Expected to be empty. */
export async function listUnfindableArtifacts(): Promise<UnfindableArtifact[]> {
  const result = await getDb().execute(unfindableArtifactsStatement());
  return z.array(unfindableRow).parse(result.rows);
}
