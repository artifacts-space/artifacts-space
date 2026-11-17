import { getArtifactAccessByOlderKey } from "@/lib/access";

import type { ArtifactRef } from "./rules";

/**
 * The public id an artifact reference names for this viewer, or null.
 *
 * A public id is returned as it is: the tool that asked reads it through
 * its own access check, as before. An older value (an internal id copied
 * from the workspace before it copied the link, or the id of a legacy
 * /share/<id> link) goes through the read decision here, in one query:
 * null when no such artifact exists and null when the viewer may not read
 * it, so the two cannot be told apart, in words or in the work done, and
 * the public id of an artifact never reaches someone who cannot read it.
 */
export async function publicIdForRef(ref: ArtifactRef, viewerId: string): Promise<string | null> {
  if (ref.kind === "publicId") return ref.publicId;
  const access = await getArtifactAccessByOlderKey(ref, viewerId);
  return access ? access.record.publicId : null;
}
