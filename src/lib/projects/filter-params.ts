import { projectNameKey, type ProjectFilter } from "./rules";

/**
 * The workspace's project filter in the URL: `?project=<name key>` for one
 * project, `?noproject=1` for artifacts without one. Keys are lowercase
 * names, so a link survives a rename only in letter case.
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

/** The query string for the workspace with a scope and a project filter, starting with "?" or "". */
export function workspaceQuery(teamSlug: string | null, filter: ProjectFilter | null): string {
  const params = new URLSearchParams();
  if (teamSlug) params.set("team", teamSlug);
  if (filter && "none" in filter) params.set("noproject", "1");
  else if (filter) params.set("project", filter.key);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** A stable string for a filter, for React keys and comparisons. */
export function projectFilterId(filter: ProjectFilter | null): string {
  if (!filter) return "all";
  return "none" in filter ? "none" : `key:${filter.key}`;
}
