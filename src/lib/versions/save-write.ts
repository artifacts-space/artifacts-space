import { randomUUID } from "node:crypto";

import { and, eq, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, artifactVersion, sharingRequest, type ArtifactRecord, type ArtifactVersionRecord } from "@/db/schema";
import type { VersionSaveKind } from "@/lib/artifact-types";
import { nextSaveTime } from "@/lib/edits/save-time";
import { writeAndAttachWith, type SaveCte, type SaveFiles } from "@/lib/files/save-statement";
import { stampColumns, type HarnessStamp } from "@/lib/harness/harness-rules";
import { notifySharingRequest } from "@/lib/notifications/create";
import type { SharingActor } from "@/lib/sharing/rules";
import { capabilityHolderTeamQuery } from "@/lib/teams/capability-sql";
import { UserFacingError } from "@/lib/user-facing-error";

import { forgetArtifactCache } from "./cache";
import { dropSupersededSessionVersion, latestVersion, pruneArtifactVersions, restampVersion } from "./history";
import type { EditSessionStep } from "./history-rules";
import { isReviewedLevel, sameReviewedFields } from "./rules";
import { getArtifactVersion, planVersionedChangeApproval, prepareVersionedChange, recordArtifactSave, type EditStatus, type VersionedChangeApproval } from "./service";

/**
 * One save of an artifact row, written so its approval can never be undone
 * by a slower save. On a link or public artifact the approval outcome is
 * decided before the write, for exactly the row the write changes, and the
 * write files the save's version and its approval (the approved version, the
 * edit request, canceled requests, an approver's audit row) in its own
 * statement, as a replaced file does (src/lib/files/replace.ts). The UPDATE
 * runs only while the row still has the save time, visibility, team, and
 * approved version the plan was made for; when another save or decision
 * moved it on, the plan is made again on the new row. Private and team
 * artifacts have no approval: their version is filed just after the write
 * (recordArtifactSave), dated at the save.
 */

type ArtifactInsert = typeof artifact.$inferInsert;

/** The fields a save changes; undefined leaves one as it is. */
export type SaveChanges = { [K in keyof ArtifactInsert]?: ArtifactInsert[K] | undefined };

/** One save: the row before it, what it changes, who saves it and how, and the uploads it attaches. */
export interface SaveSpec {
  before: ArtifactRecord;
  changes: SaveChanges;
  editorId: string;
  actor: SharingActor;
  saveKind: VersionSaveKind;
  restoredFromId: string | null;
  session?: EditSessionStep | undefined;
  harness: HarnessStamp | null | undefined;
  files: SaveFiles;
}

/** What a save that lands brings back: the row it wrote, the row it changed, which condition matched, and the approval outcome. */
export interface WrittenSave {
  record: ArtifactRecord;
  before: ArtifactRecord;
  matched: number;
  status: EditStatus;
}

/** How a link or public artifact's save meets the approval rule: "revert" brings back the approved fields, which only cancels open requests. */
type SaveApproval = VersionedChangeApproval | { outcome: "revert" };

interface ReviewedPlan {
  approvedId: string;
  /** The save's version: a new one, or the latest when the save changes nothing it shows. */
  versionId: string;
  newVersion: boolean;
  approval: SaveApproval;
  /** The latest version before the save, for an editing session's superseded version. */
  latest: ArtifactVersionRecord | null;
}

interface SavePlan {
  before: ArtifactRecord;
  reviewed: ReviewedPlan | null;
}

/** Saves that change files always go through the approval rule, because readers outside the team see files by version. */
const fileSaveKinds: ReadonlySet<VersionSaveKind> = new Set(["files", "replace"]);

/** How many times a save is planned again when other saves keep moving the row on. */
const MAX_PLANS = 4;

/** The row as the save leaves it, before the database stamps it: the plan compares its fields with versions. */
function afterOf(before: ArtifactRecord, changes: SaveSpec["changes"]): ArtifactRecord {
  const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
  return { ...before, ...defined };
}

async function approvalOf(spec: SaveSpec, before: ArtifactRecord, after: ArtifactRecord, approvedId: string): Promise<SaveApproval> {
  const approved = fileSaveKinds.has(spec.saveKind) ? null : await getArtifactVersion(approvedId);
  if (approved && sameReviewedFields(approved, after)) return { outcome: "revert" };
  return planVersionedChangeApproval(before, approvedId, spec.editorId, spec.actor);
}

/** Decides the save's version and approval for `before`, the row the write must still find. */
async function planSave(spec: SaveSpec, before: ArtifactRecord): Promise<SavePlan> {
  if (!isReviewedLevel(before.visibility)) return { before, reviewed: null };
  const approvedId = await prepareVersionedChange(before);
  if (!approvedId) return { before, reviewed: null };
  const after = afterOf(before, spec.changes);
  const latest = await latestVersion(before.id);
  const reuse = latest && spec.saveKind === "edit" && sameReviewedFields(latest, after) ? latest : null;
  const approval = await approvalOf(spec, before, after, approvedId);
  return { before, reviewed: { approvedId, versionId: reuse?.id ?? randomUUID(), newVersion: !reuse, approval, latest } };
}

/**
 * SQL: the row is still the one the plan was made for. The row's own
 * columns, so an UPDATE that waited for another save's lock re-checks them on
 * the row that save wrote. An approver's own edit also re-checks their role.
 */
function planGuard(plan: SavePlan, editorId: string): SQL {
  const { before, reviewed } = plan;
  const at = sql`date_trunc('milliseconds', ${artifact.updatedAt}) = ${before.updatedAt.toISOString()}::timestamptz`;
  const sharing = sql`${artifact.visibility} = ${before.visibility} and ${artifact.teamId} is not distinct from ${before.teamId}`;
  if (!reviewed) return sql`(${at} and ${sharing})`;
  const approved = sql`${artifact.approvedVersionId} is not distinct from ${reviewed.approvedId}`;
  const { approval } = reviewed;
  if (approval.outcome !== "apply" || approval.auditTeamId === null) return sql`(${at} and ${sharing} and ${approved})`;
  const role = sql`${artifact.teamId} in (${capabilityHolderTeamQuery(getDb(), editorId, approval.auditTeamId, "approve.edits")})`;
  return sql`(${at} and ${sharing} and ${approved} and ${role})`;
}

/** The save's version as a CTE: a new row copied from the saved row, or the latest version it changes nothing of. */
function versionCte(spec: SaveSpec, reviewed: ReviewedPlan): SaveCte {
  if (!reviewed.newVersion) return { name: "version", query: sql`select ${reviewed.versionId}::text as id, s.updated_at as saved_at from saved s` };
  const harness = spec.harness?.harness ?? null;
  return {
    name: "version",
    query: sql`
      insert into ${artifactVersion} (id, artifact_id, title, icon, theme, cover, summary, content, kind, language, project, source, metadata, bytes, harness, by_agent, created_by, save_kind, restored_from_id, created_at, saved_at)
      select ${reviewed.versionId}, s.id, s.title, s.icon, s.theme, s.cover, s.summary, s.content, s.kind, s.language, s.project, s.source, s.metadata,
        octet_length(s.content) + octet_length(s.metadata::text), ${harness}, ${spec.actor === "agent"}, ${spec.editorId}, ${spec.saveKind}, ${spec.restoredFromId}, s.updated_at, s.updated_at
      from saved s
      returning id, saved_at`,
  };
}

function canceledCte(spec: SaveSpec): SaveCte {
  return {
    name: "canceled",
    query: sql`
      update ${sharingRequest} r set status = 'canceled', decided_by = ${spec.editorId}, decided_at = version.saved_at
      from version
      where r.artifact_id = ${spec.before.id} and r.kind = 'edit' and r.status = 'pending'
      returning r.id`,
  };
}

/** The approval outcome's writes, after `version`; `note` is the id of an edit request the save opened. */
function approvalCtes(spec: SaveSpec, approval: SaveApproval): { ctes: SaveCte[]; note: SQL<string | null> } {
  const none = sql<string | null>`null::text`;
  if (approval.outcome === "revert") return { ctes: [canceledCte(spec)], note: none };
  if (approval.outcome === "pending") {
    const request: SaveCte = {
      name: "request",
      query: sql`
        insert into ${sharingRequest} (id, kind, artifact_id, team_id, requested_by, visibility, version_id, status, created_at)
        select ${randomUUID()}, 'edit', ${spec.before.id}, ${approval.teamId}, ${spec.editorId}, ${approval.requestVisibility}, version.id, 'pending', version.saved_at
        from version
        on conflict (artifact_id, kind) where status = 'pending'
        do update set version_id = excluded.version_id, team_id = excluded.team_id, visibility = excluded.visibility, requested_by = excluded.requested_by, created_at = excluded.created_at
        returning id, (xmax = 0) as opened`,
    };
    return { ctes: [request], note: sql<string | null>`(select id from request where opened limit 1)` };
  }
  if (approval.outcome !== "apply") return { ctes: [], note: none };
  const audit: SaveCte[] = approval.auditTeamId === null ? [] : [{
    name: "audit",
    query: sql`
      insert into ${sharingRequest} (id, kind, artifact_id, team_id, requested_by, visibility, version_id, status, decided_by, decided_at)
      select ${randomUUID()}, 'edit', ${spec.before.id}, ${approval.auditTeamId}, ${spec.editorId}, ${approval.requestVisibility}, version.id, 'approved', ${spec.editorId}, version.saved_at
      from version
      returning id`,
  }];
  return { ctes: [canceledCte(spec), ...audit], note: none };
}

/** One planned write: the UPDATE under `condition` and the plan's guard, with its uploads, version, and approval. Null when it matched nothing. */
async function writePlanned(spec: SaveSpec, plan: SavePlan, condition: SQL | undefined) {
  const savedAt = nextSaveTime();
  // A person's save marks when a person last saved (src/lib/artifact-save.ts); an agent's does not.
  const personSaved = spec.actor === "person" ? { personSavedAt: savedAt } : {};
  const approved = plan.reviewed?.approval.outcome === "apply" ? { approvedVersionId: plan.reviewed.versionId } : {};
  const update = getDb()
    .update(artifact)
    .set({ ...spec.changes, ...stampColumns(spec.harness), ...personSaved, ...approved, updatedBy: spec.editorId, updatedAt: savedAt })
    .where(and(eq(artifact.id, plan.before.id), condition, planGuard(plan, spec.editorId)))
    .returning();
  if (!plan.reviewed) return writeAndAttachWith(update.getSQL(), spec.editorId, spec.files);
  const { ctes, note } = approvalCtes(spec, plan.reviewed.approval);
  return writeAndAttachWith(update.getSQL(), spec.editorId, spec.files, { ctes: [versionCte(spec, plan.reviewed), ...ctes], note });
}

/** After a link or public artifact's save: its cache, a new request's notice, and History housekeeping. */
async function afterReviewedSave(spec: SaveSpec, reviewed: ReviewedPlan, record: ArtifactRecord, openedRequestId: string | null): Promise<EditStatus> {
  forgetArtifactCache(record.id);
  if (openedRequestId) notifySharingRequest(openedRequestId);
  const filed = { editorId: spec.editorId, saveKind: spec.saveKind, session: spec.session, harness: spec.harness, byAgent: spec.actor === "agent" };
  if (!reviewed.newVersion && reviewed.latest) await restampVersion(reviewed.latest, record, filed);
  if (spec.session === "continue") {
    await dropSupersededSessionVersion(record, reviewed.latest, { ...filed, newVersionId: reviewed.versionId }).catch((error: unknown) => {
      console.error("[versions] Dropping a superseded session version failed", error instanceof Error ? error.name : "unknown error");
    });
  }
  await pruneArtifactVersions(record.id).catch((error: unknown) => {
    console.error("[versions] Pruning after a save failed", error instanceof Error ? error.name : "unknown error");
  });
  return reviewed.approval.outcome === "pending" ? "pending" : "applied";
}

/** Files the save and applies its approval: in its own statement for a link or public artifact, just after it otherwise. */
async function afterWrite(spec: SaveSpec, plan: SavePlan, record: ArtifactRecord, note: string | null): Promise<EditStatus> {
  if (plan.reviewed) return afterReviewedSave(spec, plan.reviewed, record, note);
  return recordArtifactSave({ before: plan.before, after: record, editorId: spec.editorId, actor: spec.actor, saveKind: spec.saveKind, restoredFromId: spec.restoredFromId, session: spec.session, harness: spec.harness ?? null });
}

/** Whether the row moved on from what the plan was made for, so the save is planned again rather than refused. */
function planOutdated(plan: SavePlan, row: ArtifactRecord): boolean {
  const { before, reviewed } = plan;
  if (row.updatedAt.getTime() !== before.updatedAt.getTime() || row.visibility !== before.visibility || row.teamId !== before.teamId) return true;
  return reviewed !== null && row.approvedVersionId !== reviewed.approvedId;
}

/** Whether the write also re-checked the editor's approver role, which the row's columns cannot show. */
function checksRole(plan: SavePlan): boolean {
  const approval = plan.reviewed?.approval;
  return approval?.outcome === "apply" && approval.auditTeamId !== null;
}

async function currentRow(artifactId: string): Promise<ArtifactRecord | null> {
  const [row] = await getDb().select().from(artifact).where(eq(artifact.id, artifactId)).limit(1);
  return row ?? null;
}

/**
 * Writes one save under the first of `conditions` that matches (the
 * caller's refusal rules: an agent's base version, a person's base), with
 * its version and approval. Returns the save, `{ refused }` with the row as
 * it is when no condition matched the row the plan was made for, or null
 * when the artifact is gone.
 */
export async function writeSave(spec: SaveSpec, conditions: readonly (SQL | undefined)[]): Promise<WrittenSave | { refused: ArtifactRecord } | null> {
  let before = spec.before;
  let roleRechecked = false;
  for (let attempt = 0; attempt < MAX_PLANS; attempt += 1) {
    const plan = await planSave(spec, before);
    for (const [matched, condition] of conditions.entries()) {
      const written = await writePlanned(spec, plan, condition);
      if (written) return { record: written.record, before, matched, status: await afterWrite(spec, plan, written.record, written.note) };
    }
    const row = await currentRow(before.id);
    if (!row) return null;
    // A role the editor lost since the plan: plan once more, and the rule decides without it.
    const replanForRole: boolean = !roleRechecked && checksRole(plan);
    if (!planOutdated(plan, row) && !replanForRole) return { refused: row };
    roleRechecked ||= replanForRole;
    before = row;
  }
  throw new UserFacingError("The artifact kept changing while it was saved, so nothing was saved. Try again.");
}

/**
 * Records a change the artifact row does not show, such as attached or
 * removed files: it marks who saved it, files a version, and runs the
 * approval rule. Readers outside the team of a link or public artifact keep
 * the approved version (and its files) until the change is approved. Call it
 * after the change is saved.
 */
export async function recordArtifactChange(input: { artifactId: string; editorId: string; actor: SharingActor; harness?: HarnessStamp | null | undefined }): Promise<RecordedChange> {
  const [before] = await getDb().select().from(artifact).where(eq(artifact.id, input.artifactId)).limit(1);
  if (!before) return { status: "applied", record: null };
  // Like any save: stamped by the database clock, with its version and approval written so a slower save never undoes them (save-write.ts).
  const noFiles = { contentFileIds: [], imageFileIds: [] };
  const spec = { before, changes: {}, editorId: input.editorId, actor: input.actor, saveKind: "files" as const, restoredFromId: null, harness: input.harness, files: noFiles };
  const written = await writeSave(spec, [undefined]);
  if (!written || !("record" in written)) return { status: "applied", record: null };
  return { status: written.status, record: written.record };
}

/** What recordArtifactChange did: the approval outcome, and the row as this change saved it (null when the artifact is gone). */
export interface RecordedChange {
  status: EditStatus;
  record: ArtifactRecord | null;
}
