import { getTableColumns } from "drizzle-orm";

import { artifact, type ArtifactRecord } from "@/db/schema";

/**
 * Artifact columns split so queries can leave content (up to 1 MB) in the
 * database when they do not need it: lists, access checks, and quota sums.
 */

/** An artifact row without its content. */
export type ArtifactMetaRecord = Omit<ArtifactRecord, "content">;

const { content: contentColumn, ...metaColumns } = getTableColumns(artifact);

/** The content column alone, for queries that load content on purpose. */
export const artifactContentColumn = contentColumn;

/** Every artifact column except content. */
export function artifactMetaColumns() {
  return metaColumns;
}
