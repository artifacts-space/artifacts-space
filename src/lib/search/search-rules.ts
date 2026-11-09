import { isIndexable } from "@/lib/access-rules";
import type { ArtifactVisibility } from "@/lib/artifact-types";

/**
 * Whether search engines may list an artifact. Pure, so every surface (the
 * page's robots meta tag, the proxy's X-Robots-Tag header, the sitemap, and
 * the Share dialog) decides the same way and the rules are tested without a
 * database.
 *
 * Only the HTML page of a public artifact can ever be indexed, and only when
 * someone who can share it turned on "Show in search engines" and the
 * author's account is past the new-account wait (isIndexable in
 * access-rules.ts). Private, team, and link artifacts never are. The Markdown
 * and raw versions, preview images, and file downloads are never indexed:
 * they repeat the page, and cached copies would outlive the setting being
 * turned off.
 */

/** The fields of an artifact that decide whether search engines may list it. */
export interface SearchSubject {
  visibility: ArtifactVisibility;
  /** The "Show in search engines" setting, set by someone who can share it. */
  showInSearch: boolean;
}

/** The X-Robots-Tag value for every artifact response that may not be indexed. */
export const noindexHeader = "noindex, nofollow";

/** The header name, in one place so routes and the proxy agree. */
export const robotsHeaderName = "X-Robots-Tag";

/** Whether the setting counts: it is on and the artifact is public. Link, team, and private artifacts ignore it. */
export function showsInSearch(subject: SearchSubject): boolean {
  return subject.showInSearch && subject.visibility === "public";
}

/**
 * Whether search engines may index the artifact's page: the setting counts
 * and the author's account (the owner's, for an agent) is old enough.
 * Unknown account age is treated as new.
 */
export function isSearchIndexable(subject: SearchSubject, accountCreatedAt: Date | null, now: Date = new Date()): boolean {
  return showsInSearch(subject) && isIndexable(subject.visibility, accountCreatedAt, now);
}

/** The page's robots meta tag. Links inside artifacts are never followed. */
export function pageRobots(indexable: boolean): { index: boolean; follow: false } {
  return { index: indexable, follow: false };
}

/**
 * The setting after a sharing change: kept while the artifact stays public,
 * cleared when it becomes link, team, or private, so making it public again
 * starts hidden from search engines until someone who can share it turns it
 * back on.
 */
export function showInSearchAfterSharing(current: boolean, nextVisibility: ArtifactVisibility): boolean {
  return current && nextVisibility === "public";
}

/** Who asks to change the setting. Agents (MCP tokens) never do. */
export type SearchActor = "person" | "agent";

/**
 * Who may change "Show in search engines": the people who may share the
 * artifact (its author, or the person who added the agent that wrote it while
 * still in the agent's team, src/lib/agents/owner-access.ts), in the web app. Listing a page in search
 * engines is a person's decision, so agents cannot change it.
 */
export function canChangeShowInSearch(input: { actorId: string; authorId: string; actsForAuthor: boolean; actor: SearchActor }): boolean {
  if (input.actor !== "person") return false;
  return input.actorId === input.authorId || input.actsForAuthor;
}

/** Why turning the setting on is refused for this artifact, or null when it may be turned on. */
export function showInSearchProblem(visibility: ArtifactVisibility): string | null {
  if (visibility === "public") return null;
  return "Make the artifact public first. Only public artifacts can show in search engines.";
}

/** An artifact the sitemap may list, as the sitemap query loads it. */
export interface SitemapCandidate extends SearchSubject {
  publicId: string;
  /** When the author's account (the owner's, for an agent) was created. */
  accountCreatedAt: Date | null;
}

/**
 * The most artifact URLs one sitemap file lists. The protocol allows 50,000;
 * the rest of the site takes a few, and the newest listings come first.
 */
export const SITEMAP_ARTIFACT_LIMIT = 45_000;

/**
 * The sitemap URLs for artifacts: only those search engines may index, in
 * the order given. The query already filters; this repeats the rule so a
 * looser query can never list a private, link, or opted-out artifact.
 */
export function artifactSitemapPaths(candidates: readonly SitemapCandidate[], now: Date = new Date()): string[] {
  const paths: string[] = [];
  for (const candidate of candidates) {
    if (paths.length >= SITEMAP_ARTIFACT_LIMIT) break;
    if (isSearchIndexable(candidate, candidate.accountCreatedAt, now)) paths.push(`/artifact/${candidate.publicId}`);
  }
  return paths;
}
