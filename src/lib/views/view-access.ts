import type { ArtifactRecord } from "@/db/schema";
import { can } from "@/lib/teams/capability-rules";
import { getTeamMembershipById } from "@/lib/teams/queries";

/**
 * Whether someone who may edit an artifact also sees its views: its author
 * always; for an artifact shared through a team, members whose role holds
 * "see views" (everyone by default). Call after the edit check.
 */
export async function canSeeViews(viewerId: string, record: Pick<ArtifactRecord, "userId" | "teamId" | "visibility">): Promise<boolean> {
  if (record.userId === viewerId || record.teamId === null || record.visibility === "private") return true;
  const membership = await getTeamMembershipById(viewerId, record.teamId);
  return can(membership, "analytics.view");
}
