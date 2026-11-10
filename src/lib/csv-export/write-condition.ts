import { and, eq, inArray, or, type SQL } from "drizzle-orm";

import type { getDb } from "@/db";
import { artifact } from "@/db/schema";
import { ownedAgentIdsQuery } from "@/lib/agents/owner-access";
import { capabilityHolderTeamQuery } from "@/lib/teams/capability-sql";

type Db = Pick<ReturnType<typeof getDb>, "select">;

/** What the write was authorized against: the artifact as it was read. */
export interface CsvDownloadWriteTarget {
  actorId: string;
  artifactId: string;
  /** The author and team the permission check saw. */
  record: { userId: string; teamId: string | null };
}

/**
 * The WHERE clause for saving "Allow CSV download": canChangeCsvDownload
 * again, in the same statement as the write, so nothing that changed since
 * the permission check can slip through. The row must still be this CSV
 * artifact with the same author, and the actor must still be, right now,
 * its author, the person who added the agent that wrote it (while still in
 * that agent's team), or a person whose role in the artifact's team, still
 * the team that was checked, may approve sharing. Every subquery is
 * uncorrelated with qualified columns (see the tripwire in AGENTS.md).
 * Exported for its `.toSQL()` test.
 */
export function csvDownloadWriteCondition(db: Db, { actorId, artifactId, record }: CsvDownloadWriteTarget): SQL {
  const mayStillChange = or(
    eq(artifact.userId, actorId),
    inArray(artifact.userId, ownedAgentIdsQuery(db, actorId, record.userId)),
    record.teamId ? inArray(artifact.teamId, capabilityHolderTeamQuery(db, actorId, record.teamId, "approve.sharing")) : undefined,
  );
  const condition = and(eq(artifact.id, artifactId), eq(artifact.kind, "csv"), eq(artifact.userId, record.userId), mayStillChange);
  if (!condition) throw new Error("The CSV download write condition could not be built.");
  return condition;
}
