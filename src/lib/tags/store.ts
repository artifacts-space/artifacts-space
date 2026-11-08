import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifact } from "@/lib/access";
import type { ProjectScope } from "@/lib/projects/rules";
import { loadHomeScope } from "@/lib/projects/scope";
import { UserFacingError } from "@/lib/user-facing-error";

import { tagLimits } from "./limits";
import { applyTagChange, checkTagChange, newTags, parseTags, vocabularyWouldOverflow, type TagChange } from "./rules";
import { scopeTagCount, scopeTags, tagsInScope, type TagFacet } from "./queries";

/**
 * Tag writes. Anyone who may edit an artifact may change its tags at once:
 * no approval, no version, and the save time stays. Each scope (a person's
 * own, or one shared team's) has a runaway cap on how many different tags
 * it uses.
 */

/** Refuses tags new to the scope when they would take it past its cap. */
async function assertRoomForTags(scope: ProjectScope, candidates: readonly string[]): Promise<void> {
  if (candidates.length === 0) return;
  const known = await tagsInScope(scope, candidates);
  const adding = newTags(candidates, known).length;
  if (adding === 0) return;
  if (vocabularyWouldOverflow(await scopeTagCount(scope), adding)) {
    throw new UserFacingError(`This space already uses ${String(tagLimits.maxPerScope)} different tags. Reuse some, or remove ones you no longer need.`);
  }
}

/** A new artifact's tags, normalized and checked, without touching the database. */
export function parseNewTags(tags: readonly string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  return parseTags(() => applyTagChange([], { set: [...tags] }));
}

/** Refuses a new, private artifact's tags when they would take the author past their tag cap. */
export async function assertRoomForNewTags(userId: string, tags: readonly string[]): Promise<void> {
  await assertRoomForTags({ kind: "user", userId }, tags);
}

/** Tries before giving up when other saves keep changing the tags in between. */
const WRITE_ATTEMPTS = 3;

/**
 * Applies a change to the tags as they are now. The write lands only if
 * nobody changed the tags since they were read, so two people (or an agent
 * and a person) adding tags at once never drop each other's. Returns the
 * new tags, undefined when the artifact is gone or no longer editable, or
 * null when other saves kept winning.
 */
async function writeTags(editorId: string, artifactId: string, change: TagChange): Promise<string[] | null | undefined> {
  const record = await getEditableArtifact(editorId, { id: artifactId });
  if (!record) return undefined;
  const next = parseTags(() => applyTagChange(record.tags, change));
  await assertRoomForTags(await loadHomeScope(record), newTags(next, new Set(record.tags)));
  const written = await getDb()
    .update(artifact)
    .set({ tags: next })
    .where(and(eq(artifact.id, record.id), eq(artifact.tags, record.tags)))
    .returning();
  return written.length > 0 ? next : null;
}

/**
 * Changes the tags of an artifact the editor may edit: replace the set, or
 * add and remove some. Returns the new tags, or undefined when they may not
 * edit it ("not found"). Counts against the organize limit; never files a
 * version.
 */
export async function setArtifactTags(editorId: string, artifactId: string, change: TagChange): Promise<string[] | undefined> {
  const checked = checkTagChange(change);
  if (!(await getEditableArtifact(editorId, { id: artifactId }))) return undefined;
  await enforceRateLimit("organize", editorId);
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const result = await writeTags(editorId, artifactId, checked);
    if (result !== null) return result;
  }
  throw new UserFacingError("The tags changed just now. Try again.");
}

/** The tags an artifact's editors can pick from: those its home scope uses. Undefined when they may not edit it. */
export async function listArtifactTagSuggestions(editorId: string, artifactId: string): Promise<TagFacet[] | undefined> {
  const record = await getEditableArtifact(editorId, { id: artifactId });
  if (!record) return undefined;
  return scopeTags(await loadHomeScope(record));
}
