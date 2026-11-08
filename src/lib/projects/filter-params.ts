import { tagLimits } from "../tags/limits";
import { tagSchema } from "../tags/rules";

import { projectNameKey, type ProjectFilter } from "./rules";

/**
 * The workspace's project filter in the URL: `?project=<name key>` for one
 * project, `?noproject=1` for artifacts without one. Keys are lowercase
 * names, so a link survives a rename only in letter case. Tags add
 * `?tag=<tag>` once per tag; an artifact must carry every one.
 */

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The project filter a URL asks for, or null for all projects. */
export function parseProjectFilter(params: SearchParams): ProjectFilter | null {
  if (first(params.noproject) === "1") return { none: true };
  const key = projectNameKey((first(params.project) ?? "").slice(0, 240));
  return key ? { key } : null;
}

/** The tag filter a URL asks for: normalized, without repeats, at most one artifact's worth. */
export function parseTagFilter(params: SearchParams): string[] {
  const values = params.tag === undefined ? [] : [params.tag].flat();
  const tags = values.slice(0, tagLimits.maxPerArtifact * 2).flatMap((value) => {
    const parsed = tagSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  return [...new Set(tags)].slice(0, tagLimits.maxPerArtifact);
}

/** The query string for the workspace with a scope, a project filter, and tags, starting with "?" or "". */
export function workspaceQuery(teamSlug: string | null, filter: ProjectFilter | null, tags: readonly string[] = []): string {
  const params = new URLSearchParams();
  if (teamSlug) params.set("team", teamSlug);
  if (filter && "none" in filter) params.set("noproject", "1");
  else if (filter) params.set("project", filter.key);
  for (const tag of tags) params.append("tag", tag);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** A stable string for a filter, for React keys and comparisons. */
export function projectFilterId(filter: ProjectFilter | null): string {
  if (!filter) return "all";
  return "none" in filter ? "none" : `key:${filter.key}`;
}
