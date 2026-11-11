import type { ArtifactMetaRecord } from "@/lib/artifact-columns";
import { canShareArtifact } from "@/lib/access-rules";
import type { ShareableArtifactDto } from "@/lib/artifact-types";
import { pendingRequestsFor, type PendingRequests } from "@/lib/artifacts";
import { showsInSearch } from "@/lib/search/search-rules";
import { listTeamsForUser, type TeamMembership } from "@/lib/teams/queries";

/** What the artifact page's Share dialog needs: the artifact's sharing state and the sharer's teams. */
export interface PageShare {
  artifact: ShareableArtifactDto;
  teams: TeamMembership[];
}

const noPending: PendingRequests = { sharing: null, edit: null, comments: null };

/** The stored fields the Share dialog shows. */
type ShareRecord = Pick<ArtifactMetaRecord, "id" | "publicId" | "userId" | "title" | "icon" | "visibility" | "teamId" | "comments" | "showInSearch">;

/** The page's access decision, as far as sharing needs it (ArtifactAccess). */
interface ShareAccess {
  record: ShareRecord;
  /** The viewer belongs to the artifact's team. */
  isTeamMember: boolean;
  /** The viewer added the agent that wrote it and is still in its team. */
  actsForAuthor: boolean;
}

/**
 * Whether this viewer gets Share on the artifact's page: the same people who
 * get it in the workspace (canShareArtifact). Signed-out readers, readers of
 * a link or public page, and teammates who may edit it (owners and admins
 * among them) keep the read-only status.
 */
export function sharesOnPage(access: Pick<ShareAccess, "isTeamMember" | "actsForAuthor"> & { record: Pick<ShareRecord, "userId"> }, viewerId: string | null): viewerId is string {
  if (!viewerId) return false;
  // The same viewer the workspace passes (use-edit-access.ts): the real team membership, so the two never diverge.
  return canShareArtifact({ userId: access.record.userId }, { userId: viewerId, isTeamMember: access.isTeamMember, actsForAuthor: access.actsForAuthor });
}

/** The Share dialog's view of a stored row and its open requests. */
export function toShareableArtifact(record: ShareRecord, pending: PendingRequests): ShareableArtifactDto {
  return {
    id: record.id,
    publicId: record.publicId,
    title: record.title,
    icon: record.icon,
    visibility: record.visibility,
    teamId: record.teamId,
    comments: record.comments,
    showInSearch: showsInSearch(record),
    pendingSharing: pending.sharing,
    pendingEdit: pending.edit,
    pendingComments: pending.comments,
  };
}

/**
 * The Share dialog's data for the artifact page, loaded only for someone who
 * may share it (sharesOnPage); null for everyone else, who never receive the
 * open requests or the list of teams. Saving goes through the workspace's
 * server actions, which check the same rule again.
 */
export async function loadPageShare(access: ShareAccess, viewerId: string | null): Promise<PageShare | null> {
  if (!sharesOnPage(access, viewerId)) return null;
  const { record } = access;
  const [pending, teams] = await Promise.all([pendingRequestsFor([record.id]), listTeamsForUser(viewerId)]);
  return { artifact: toShareableArtifact(record, pending.get(record.id) ?? noPending), teams };
}
