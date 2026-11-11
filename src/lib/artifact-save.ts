import { and, eq, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, type ArtifactRecord } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { assertValidArtifactUpdate } from "@/lib/artifact-content";
import { iconFileId } from "@/lib/artifact-icons";
import type { ArtifactChanges } from "@/lib/artifacts";
import { coverFileId } from "@/lib/covers/cover";
import { agentWriteCondition, editingPerson, hasLiveLease, hasPersonSavedLast, lastSavedBy, onlyAgentsSavedSince } from "@/lib/edits/agent-write-guard";
import { BadBaseVersionError, EditConflictError } from "@/lib/edits/conflict-error";
import { agentWriteRefusal, parseBaseVersion, touchesGuardedFields, type AgentWriteRefusal, type BaseVersion } from "@/lib/edits/edit-conflict-rules";
import { nextSaveTime } from "@/lib/edits/save-time";
import { pruneUnusedContentFilesQuietly, pruneUnusedIconFilesQuietly } from "@/lib/files/icon-cleanup";
import { droppedContentRefs } from "@/lib/files/icon-cleanup-rules";
import { checkUpdatedContentFiles, writeAndAttach, type SaveFiles } from "@/lib/files/save-attach";
import { stampColumns } from "@/lib/harness/harness-rules";
import { assertContentFits } from "@/lib/quota/usage";
import { StaleSaveError, unchangedSince, type SaveOptions } from "@/lib/save-guard";
import type { SharingActor } from "@/lib/sharing/rules";
import { assertTeamPresetUsable } from "@/lib/themes/team-preset-access";
import { recordArtifactSave } from "@/lib/versions/service";

/**
 * Writing one save of an artifact's fields: the checks, the guarded UPDATE,
 * and the version it files. When a person and an agent change an artifact at
 * once, the person's work wins (src/lib/edits/edit-conflict-rules.ts):
 *
 * - An agent's save names the version it read (`baseVersion`); the UPDATE
 *   matches only while the artifact is still at it. Without one, it matches
 *   only while the newest save is not a person's (any field), and a change
 *   to the title, content, or format also needs no person's edit lease to be
 *   live. A refused save writes nothing and throws EditConflictError.
 * - A person's web save names the version its draft started from
 *   (`expectedUpdatedAt`). When someone saved since, it still goes through if
 *   every save since was an agent's: the agents' versions stay in History.
 *   A newer save by another person refuses it (StaleSaveError), as before.
 *
 * Every check that decides is part of the UPDATE itself, so two racing saves
 * can never both pass it.
 */

export interface SaveContext {
  editorId: string;
  before: ArtifactRecord;
  actor: SharingActor;
  options: SaveOptions;
  restoredFromId?: string | null;
}

/** What a save wrote: the row, and whether it went over agents' newer saves (a person's save only). */
export interface SavedRow {
  record: ArtifactRecord;
  savedOverAgents: boolean;
}

/** True when a save replaced or removed an uploaded image icon or cover. */
function imageChanged(before: ArtifactRecord, after: ArtifactRecord): boolean {
  return (iconFileId(before.icon) !== null && after.icon !== before.icon) || (coverFileId(before.cover) !== null && after.cover !== before.cover);
}

/** How a save is filed: a restore stands alone; an edit may belong to an editing session. */
function saveKindOf(context: SaveContext) {
  if (context.restoredFromId) return { saveKind: "restore" as const, restoredFromId: context.restoredFromId };
  return { saveKind: "edit" as const, restoredFromId: null, session: context.options.session };
}

/**
 * The limit a save counts against: an autosave that continues an open
 * editing session folds into that session's version, so it has its own
 * runaway cap; every other save can file a version and counts as an edit.
 */
function saveLimit(context: SaveContext) {
  return !context.restoredFromId && context.options.session === "continue" ? "artifactAutosave" : "artifactUpdate";
}

/** An agent's base version, parsed; undefined when it sent none. */
function agentBase(context: SaveContext): BaseVersion | undefined {
  const token = context.options.baseVersion;
  if (token === undefined || context.actor !== "agent") return undefined;
  const base = parseBaseVersion(token);
  if (!base) throw new BadBaseVersionError();
  return base;
}

/** Whether an agent's save is held to a person's lease: it changes the title, content, or format, or brings back a version. */
function isGuarded(changes: ArtifactChanges, context: SaveContext): boolean {
  return Boolean(context.restoredFromId) || touchesGuardedFields(changes);
}

/** The refused agent's error, with who saved last or who is typing. */
async function conflictFor(refusal: AgentWriteRefusal, artifactId: string): Promise<EditConflictError> {
  return new EditConflictError(refusal, refusal === "editing" ? await editingPerson(artifactId) : await lastSavedBy(artifactId));
}

/** What the agent-write rule needs besides the base: a live lease (only for a guarded save) and whether a person saved last, read only when no base was sent. */
async function baselessState(artifactId: string, base: BaseVersion | undefined, guarded: boolean) {
  if (base) return { leaseLive: false, personSavedLast: false };
  const [leaseLive, personSavedLast] = await Promise.all([guarded ? hasLiveLease(artifactId) : Promise.resolve(false), hasPersonSavedLast(artifactId)]);
  return { leaseLive, personSavedLast };
}

/**
 * Refuses an agent's save before anything happens (no files attached, no
 * row written) when the rule already says no. The UPDATE checks again, so
 * a save that races past this is still refused.
 */
async function assertAgentMayWrite(changes: ArtifactChanges, context: SaveContext, base: BaseVersion | undefined) {
  if (context.actor !== "agent") return;
  const guarded = isGuarded(changes, context);
  const state = await baselessState(context.before.id, base, guarded);
  const refusal = agentWriteRefusal({ base, updatedAt: context.before.updatedAt, guarded, ...state });
  if (refusal) throw await conflictFor(refusal, context.before.id);
}

/** One save's write: its changes, who saves, and the uploads it attaches when it lands. */
interface Write {
  changes: ArtifactChanges;
  context: SaveContext;
  files: SaveFiles;
}

/**
 * One guarded UPDATE, with the save's uploads attached in the same
 * statement (writeAndAttach): the row as saved, or null when the condition
 * did not match. The save time comes from the database clock (nextSaveTime).
 */
async function updateWhere({ changes, context, files }: Write, condition: SQL | undefined): Promise<ArtifactRecord | null> {
  const savedAt = nextSaveTime();
  // A person's save marks when a person last saved, so later web saves can tell agents' saves from people's.
  const personSaved = context.actor === "person" ? { personSavedAt: savedAt } : {};
  const update = getDb()
    .update(artifact)
    .set({ ...changes, ...stampColumns(context.options.harness), ...personSaved, updatedBy: context.editorId, updatedAt: savedAt })
    .where(and(eq(artifact.id, context.before.id), condition))
    .returning();
  return writeAndAttach(update.getSQL(), context.editorId, files);
}

/** The refusal to report when nothing explains a miss any more: a stale base, a lease that ended (title, content, or format), or a person's save. */
function fallbackRefusal(base: BaseVersion | undefined, guarded: boolean): AgentWriteRefusal {
  if (base) return "changed";
  return guarded ? "editing" : "base_needed";
}

/** Why an agent's UPDATE matched nothing, read after the fact; null when the artifact is gone. */
async function agentRefusalAfter(context: SaveContext, guarded: boolean, base: BaseVersion | undefined): Promise<EditConflictError | null> {
  const [current] = await getDb().select({ updatedAt: artifact.updatedAt }).from(artifact).where(eq(artifact.id, context.before.id)).limit(1);
  if (!current) return null;
  const state = await baselessState(context.before.id, base, guarded);
  // A lease that ended in between, or a person's save an agent's has since followed, still refused this save: name the likelier one.
  const refusal = agentWriteRefusal({ base, updatedAt: current.updatedAt, guarded, ...state }) ?? fallbackRefusal(base, guarded);
  return conflictFor(refusal, context.before.id);
}

/** An agent's save: matched only while its base is current; without one, only while no person saved last or types (agentWriteCondition). */
async function writeAgentSave(write: Write, base: BaseVersion | undefined): Promise<SavedRow | null> {
  const { changes, context } = write;
  const guarded = isGuarded(changes, context);
  const record = await updateWhere(write, agentWriteCondition(context.before.id, { base, guarded }));
  if (record) return { record, savedOverAgents: false };
  const refusal = await agentRefusalAfter(context, guarded, base);
  if (refusal) throw refusal;
  return null;
}

/**
 * A person's save. With a base (`expectedUpdatedAt`), it first matches only
 * while the artifact is still at that base; when someone saved since, it
 * matches again only when every save since was an agent's, and reports that
 * it went over them. A newer save by another person refuses it, and so
 * does a base later than the artifact's last save, which no server handed
 * out (onlyAgentsSavedSince).
 */
async function writePersonSave(write: Write): Promise<SavedRow | null> {
  const { context } = write;
  const expected = context.options.expectedUpdatedAt;
  const exact = await updateWhere(write, unchangedSince(expected, context.before.publicId));
  if (exact) return { record: exact, savedOverAgents: false };
  if (!expected) return null;
  const overAgents = await updateWhere(write, onlyAgentsSavedSince(context.before.id, new Date(expected)));
  if (overAgents) return { record: overAgents, savedOverAgents: true };
  throw new StaleSaveError(context.before.publicId);
}

/** The guarded write for the save's actor. */
function writeGuarded(write: Write, base: BaseVersion | undefined): Promise<SavedRow | null> {
  return write.context.actor === "agent" ? writeAgentSave(write, base) : writePersonSave(write);
}

/**
 * Checks and writes one save, files its version, and cleans up images and
 * media it dropped. Saves are limited per editor per hour (web and MCP
 * together), because each one can file a version; see saveLimit. Returns
 * null when the artifact is gone.
 */
export async function writeArtifactSave(changes: ArtifactChanges, context: SaveContext): Promise<SavedRow | null> {
  const { editorId, before } = context;
  const base = agentBase(context);
  await enforceRateLimit(saveLimit(context), editorId);
  await assertAgentMayWrite(changes, context, base);
  // Content counts toward the author's account, whoever edits it.
  if (changes.content !== undefined) await assertContentFits(before.userId, changes.content, before.content, editorId);
  await assertValidArtifactUpdate(changes, () => Promise.resolve(before));
  // A restore keeps the version's theme as it was; a team preset it may no longer use just falls back.
  if (!context.restoredFromId && changes.theme !== before.theme) await assertTeamPresetUsable(editorId, before, changes.theme);
  // Uploads attach in the same statement as the write: a refused save attaches nothing, and the version filed next includes them.
  const files = await checkUpdatedContentFiles(editorId, before, changes);
  const saved = await writeGuarded({ changes, context, files }, base);
  if (!saved) return null;
  const { record } = saved;
  await recordArtifactSave({ before, after: record, editorId, actor: context.actor, ...saveKindOf(context), harness: context.options.harness ?? null });
  // A replaced or removed image icon or cover goes with this save, unless something still shows it (see icon-cleanup.ts).
  if (imageChanged(before, record)) await pruneUnusedIconFilesQuietly(record.id, [before.icon, before.cover]);
  // So does media the content stopped embedding, once no version names it (a merged save can drop the only one).
  await pruneUnusedContentFilesQuietly(record.id, droppedContentRefs(before, record));
  return saved;
}
