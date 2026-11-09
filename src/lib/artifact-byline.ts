import type { ArtifactRecord } from "@/db/schema";
import { attribution } from "@/lib/agents/identity";
import { loadActor } from "@/lib/agents/queries";
import { loadTeamBasics } from "@/lib/teams/team-basics";

type BylineSubject = Pick<ArtifactRecord, "userId" | "teamId">;

/**
 * Who shared an artifact, for its page. An agent's work reads "@agent for
 * <owner>". The team's name is shown only to signed-in members of that team;
 * everyone else sees the author alone. `avatar` seeds the author's pixel
 * avatar.
 */
export async function loadArtifactByline(record: BylineSubject, viewerIsTeamMember: boolean) {
  const [actor, shownTeam] = await Promise.all([
    loadActor(record.userId),
    viewerIsTeamMember && record.teamId ? loadTeamBasics(record.teamId) : Promise.resolve(null),
  ]);
  return {
    author: actor ? attribution({ ...actor, ownerName: actor.kind === "agent" ? actor.ownerName : null }) : "a user",
    /** Seeds the author's pixel avatar. Null when the author is no longer an actor. */
    avatar: actor ? { seed: actor.userId, kind: actor.kind } : null,
    teamName: shownTeam && !shownTeam.personal ? shownTeam.name : null,
  };
}
