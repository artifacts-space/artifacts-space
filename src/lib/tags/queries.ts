import { and, arrayContains, count, desc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { artifact, team } from "@/db/schema";
import { seesOrganizers, type OrganizerSubject } from "@/lib/projects/queries";
import type { ProjectScope } from "@/lib/projects/rules";
import { sharedTeamIdsFor } from "@/lib/projects/scope";

/**
 * Tag reads. Tags live on the artifact row; who sees them follows the same
 * rule as projects (seesOrganizers): the author, and members of the shared
 * team an artifact is shared through. Every tag query here adds that rule in
 * SQL, so a list, search, or filter never reveals another reader's tags.
 */

/** One tag in a list's filter, with how many artifacts in the list carry it. */
export interface TagFacet {
  tag: string;
  count: number;
}

/** The most tags a filter or suggestion list offers. */
const FACET_LIMIT = 200;

function must(condition: SQL | undefined): SQL {
  if (!condition) throw new Error("The tag condition could not be built.");
  return condition;
}

/** SQL for "the viewer may see this artifact's tags": theirs, or shared through one of their shared teams. */
export async function tagsVisibleCondition(viewerId: string): Promise<SQL> {
  const own = eq(artifact.userId, viewerId);
  const teams = await sharedTeamIdsFor(viewerId);
  if (teams.size === 0) return own;
  return must(or(own, and(ne(artifact.visibility, "private"), inArray(artifact.teamId, [...teams]))));
}

/**
 * SQL for "this artifact lives in the scope" (its home scope, see
 * artifactHomeScope): a shared team's non-private artifacts, or the
 * author's private ones and those shared through no team or a personal one.
 * The personal-team subquery is not correlated (see the tripwire in AGENTS.md).
 */
export function homeScopeCondition(scope: ProjectScope): SQL {
  if (scope.kind === "team") return must(and(eq(artifact.teamId, scope.teamId), ne(artifact.visibility, "private")));
  const personalTeams = getDb().select({ id: team.id }).from(team).where(eq(team.personal, true));
  return must(and(eq(artifact.userId, scope.userId), or(eq(artifact.visibility, "private"), isNull(artifact.teamId), inArray(artifact.teamId, personalTeams))));
}

/** SQL for the tag filter: artifacts that carry every one of the tags, among those whose tags the viewer may see. */
export async function tagFilterCondition(viewerId: string, tags: readonly string[]): Promise<SQL> {
  return must(and(arrayContains(artifact.tags, [...tags]), await tagsVisibleCondition(viewerId)));
}

/** SQL matching artifacts with a tag containing the pattern, among those whose tags the viewer may see. */
export async function tagSearchCondition(viewerId: string, pattern: string): Promise<SQL> {
  return must(and(await tagsVisibleCondition(viewerId), sql`array_to_string(${artifact.tags}, E'\\n') ilike ${pattern}`));
}

/** Every tag use among the artifacts matching `condition`, one row per artifact and tag. */
function tagUses(condition: SQL) {
  return getDb().select({ tag: sql<string>`unnest(${artifact.tags})`.as("tag") }).from(artifact).where(condition).as("tagged");
}

/** The query for tags with their counts among the artifacts matching `condition`, most used first. Exported for SQL tests. */
export function tagCountsQuery(condition: SQL, limit: number) {
  const tagged = tagUses(condition);
  const uses = count();
  return getDb().select({ tag: tagged.tag, count: uses }).from(tagged).groupBy(tagged.tag).orderBy(desc(uses), tagged.tag).limit(limit);
}

/** The query for how many different tags the artifacts matching `condition` use. Exported for SQL tests. */
export function distinctTagCountQuery(condition: SQL) {
  const tagged = tagUses(condition);
  return getDb().select({ total: sql<number>`count(distinct ${tagged.tag})`.mapWith(Number) }).from(tagged);
}

/** The query for which of these tags the artifacts matching `condition` already use. Exported for SQL tests. */
export function knownTagsQuery(condition: SQL, tags: readonly string[]) {
  const tagged = tagUses(condition);
  return getDb().selectDistinct({ tag: tagged.tag }).from(tagged).where(inArray(tagged.tag, [...tags]));
}

/** The tag filter's entries for a list (`listCondition` is its scope condition), counted over every artifact in it. */
export async function loadTagFacets(viewerId: string, listCondition: SQL): Promise<TagFacet[]> {
  return tagCountsQuery(must(and(listCondition, await tagsVisibleCondition(viewerId))), FACET_LIMIT);
}

/** A scope's tags, most used first, for suggestions. The caller checks the viewer may use the scope. */
export async function scopeTags(scope: ProjectScope): Promise<TagFacet[]> {
  return tagCountsQuery(homeScopeCondition(scope), FACET_LIMIT);
}

/** How many different tags a scope's artifacts use, for the runaway cap. */
export async function scopeTagCount(scope: ProjectScope): Promise<number> {
  const [row] = await distinctTagCountQuery(homeScopeCondition(scope));
  return row?.total ?? 0;
}

/** Which of these tags a scope already uses. */
export async function tagsInScope(scope: ProjectScope, tags: readonly string[]): Promise<Set<string>> {
  if (tags.length === 0) return new Set();
  const rows = await knownTagsQuery(homeScopeCondition(scope), tags);
  return new Set(rows.map((row) => row.tag));
}

/** The artifact fields that decide who sees its tags, and the tags. */
export type TagSubject = Omit<OrganizerSubject, "projectId"> & { tags: string[] };

/** Each artifact's tags as this viewer may see them, by artifact id: [] for artifacts they may not organize. */
export async function tagsForViewer(subjects: readonly TagSubject[], viewerId: string): Promise<Map<string, string[]>> {
  const tagged = subjects.filter((subject) => subject.tags.length > 0);
  const needsTeams = tagged.some((subject) => subject.userId !== viewerId);
  const shared = needsTeams ? await sharedTeamIdsFor(viewerId) : new Set<string>();
  return new Map(subjects.map((subject) => [subject.id, subject.tags.length > 0 && seesOrganizers(subject, viewerId, shared) ? subject.tags : []]));
}
