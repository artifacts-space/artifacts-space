import { and, desc, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { artifactVersion, sharingRequest } from "@/db/schema";

/*
 * Facts about versions that History holds beside them: who approved an
 * edit, and when (the approved edit request, or the audit row an approver's
 * own save files: src/lib/versions/save-write.ts), and which version came
 * before one. Callers check that the viewer may edit the artifact first
 * (getEditableArtifact): only they see its history.
 */

/** Who approved a version and when, as the approval was recorded. */
export interface VersionApproval {
  approvedBy: string | null;
  approvedAt: string;
}

/** The query behind versionApprovals: approved edit requests of one artifact naming these versions. Single-table, no subquery. Exported for its `.toSQL()` test. */
export function versionApprovalsQuery(db: Pick<ReturnType<typeof getDb>, "select">, artifactId: string, versionIds: readonly string[]) {
  return db
    .select({ versionId: sharingRequest.versionId, decidedBy: sharingRequest.decidedBy, decidedAt: sharingRequest.decidedAt })
    .from(sharingRequest)
    .where(
      and(
        eq(sharingRequest.artifactId, artifactId),
        eq(sharingRequest.kind, "edit"),
        eq(sharingRequest.status, "approved"),
        inArray(sharingRequest.versionId, [...versionIds]),
        isNotNull(sharingRequest.decidedAt),
      ),
    )
    .orderBy(desc(sharingRequest.decidedAt));
}

/**
 * The recorded approval of each of these versions of one artifact, by
 * version id: the latest decision when there are several. One query, and
 * none for an empty list. A version approved some other way (the snapshot
 * a sharing approval takes) has no entry.
 */
export async function versionApprovals(artifactId: string, versionIds: readonly string[]): Promise<Map<string, VersionApproval>> {
  const approvals = new Map<string, VersionApproval>();
  if (versionIds.length === 0) return approvals;
  for (const row of await versionApprovalsQuery(getDb(), artifactId, versionIds)) {
    if (!row.versionId || !row.decidedAt || approvals.has(row.versionId)) continue;
    approvals.set(row.versionId, { approvedBy: row.decidedBy, approvedAt: row.decidedAt.toISOString() });
  }
  return approvals;
}

const current = alias(artifactVersion, "current_version");
const earlier = alias(artifactVersion, "earlier_version");

/**
 * The query behind previousVersionId: the version of the same artifact
 * saved just before one, in History's own order (created, then id), read
 * against the stored time itself (a timestamp passed back in would lose its
 * microseconds). A self-join through two aliases, so every column is
 * qualified (AGENTS.md tripwire). Exported for its `.toSQL()` test.
 */
export function previousVersionQuery(db: Pick<ReturnType<typeof getDb>, "select">, artifactId: string, versionId: string) {
  const before = or(lt(earlier.createdAt, current.createdAt), and(eq(earlier.createdAt, current.createdAt), lt(earlier.id, current.id)));
  return db
    .select({ id: earlier.id })
    .from(current)
    .innerJoin(earlier, and(eq(earlier.artifactId, current.artifactId), before))
    .where(and(eq(current.id, versionId), eq(current.artifactId, artifactId)))
    .orderBy(desc(earlier.createdAt), desc(earlier.id))
    .limit(1);
}

/** The id of the version saved just before this one, or null for the first. */
export async function previousVersionId(artifactId: string, versionId: string): Promise<string | null> {
  const [row] = await previousVersionQuery(getDb(), artifactId, versionId);
  return row?.id ?? null;
}
