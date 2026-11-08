import { eq } from "drizzle-orm";
import { ZodError } from "zod";

import { getDb } from "@/db";
import { artifact } from "@/db/schema";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { getEditableArtifact } from "@/lib/access";
import type { ProjectScope } from "@/lib/projects/rules";
import { loadHomeScope } from "@/lib/projects/scope";
import { UserFacingError } from "@/lib/user-facing-error";

import { tagLimits } from "./limits";
import { applyTagChange, newTags, vocabularyWouldOverflow, type TagChange } from "./rules";
import { scopeTagCount, scopeTags, tagsInScope, type TagFacet } from "./queries";

/**
 * Tag writes. Anyone who may edit an artifact may change its tags at once:
 * no approval, no version, and the save time stays. Each scope (a person's
 * own, or one shared team's) has a runaway cap on how many different tags
 * it uses.
 */

/** Runs a tag rule, turning a validation error into a message people and agents can act on. */
function parseTags<T>(rule: () => T): T {
  try {
    return rule();
  } catch (error) {
    if (error instanceof ZodError) throw new UserFacingError(error.issues[0]?.message ?? "Those tags are not valid.");
    throw error;
  }
}

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

/** Tags for a new, private artifact: normalized, capped, and within the author's tag cap. */
export async function tagsForNewArtifact(userId: string, tags: readonly string[] | undefined): Promise<string[]> {
  if (!tags || tags.length === 0) return [];
  const next = parseTags(() => applyTagChange([], { set: [...tags] }));
  await assertRoomForTags({ kind: "user", userId }, next);
  return next;
}

/**
 * Changes the tags of an artifact the editor may edit: replace the set, or
 * add and remove some. Returns the new tags, or undefined when they may not
 * edit it ("not found"). Counts against the organize limit; never files a
 * version.
 */
export async function setArtifactTags(editorId: string, artifactId: string, change: TagChange): Promise<string[] | undefined> {
  const record = await getEditableArtifact(editorId, { id: artifactId });
  if (!record) return undefined;
  await enforceRateLimit("organize", editorId);
  const next = parseTags(() => applyTagChange(record.tags, change));
  const current = new Set(record.tags);
  await assertRoomForTags(await loadHomeScope(record), newTags(next, current));
  await getDb().update(artifact).set({ tags: next }).where(eq(artifact.id, record.id));
  return next;
}

/** The tags an artifact's editors can pick from: those its home scope uses. Undefined when they may not edit it. */
export async function listArtifactTagSuggestions(editorId: string, artifactId: string): Promise<TagFacet[] | undefined> {
  const record = await getEditableArtifact(editorId, { id: artifactId });
  if (!record) return undefined;
  return scopeTags(await loadHomeScope(record));
}
