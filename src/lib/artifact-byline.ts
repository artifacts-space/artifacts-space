import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { team, user, type ArtifactRecord } from "@/db/schema";

/**
 * Who shared an artifact, for its page. The team's name is shown only to
 * signed-in members of that team; everyone else sees the author alone.
 */
export async function loadArtifactByline(record: ArtifactRecord, viewerIsTeamMember: boolean) {
  const [author, sharedIn] = await Promise.all([
    getDb().select({ name: user.name, username: user.username }).from(user).where(eq(user.id, record.userId)).limit(1),
    viewerIsTeamMember && record.teamId
      ? getDb().select({ name: team.name, personal: team.personal }).from(team).where(eq(team.id, record.teamId)).limit(1)
      : Promise.resolve([]),
  ]);
  const person = author[0];
  const shownTeam = sharedIn[0];
  return {
    author: person?.username ? `@${person.username}` : person?.name || "a user",
    teamName: shownTeam && !shownTeam.personal ? shownTeam.name : null,
  };
}
