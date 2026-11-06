import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { team, type ArtifactRecord } from "@/db/schema";
import { attribution } from "@/lib/agents/identity";
import { loadActors } from "@/lib/agents/queries";

/**
 * Who shared an artifact, for its page. An agent's work reads "@agent for
 * <owner>". The team's name is shown only to signed-in members of that team;
 * everyone else sees the author alone.
 */
export async function loadArtifactByline(record: ArtifactRecord, viewerIsTeamMember: boolean) {
  const [actors, sharedIn] = await Promise.all([
    loadActors([record.userId]),
    viewerIsTeamMember && record.teamId
      ? getDb().select({ name: team.name, personal: team.personal }).from(team).where(eq(team.id, record.teamId)).limit(1)
      : Promise.resolve([]),
  ]);
  const actor = actors.get(record.userId);
  const shownTeam = sharedIn[0];
  return {
    author: actor ? attribution({ ...actor, ownerName: actor.kind === "agent" ? actor.ownerName : null }) : "a user",
    teamName: shownTeam && !shownTeam.personal ? shownTeam.name : null,
  };
}
