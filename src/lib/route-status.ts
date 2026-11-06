/**
 * Pure routing decisions for src/proxy.ts, which answers with real HTTP
 * statuses before a page starts streaming (once a Cache Components page
 * streams, its status is fixed at 200).
 */

export type RouteCheck =
  | { kind: "artifact"; publicId: string }
  | { kind: "thread"; publicId: string }
  | { kind: "team"; slug: string }
  | { kind: "workspace" }
  | null;

const artifactPath = /^\/artifact\/([^/]+)\/?$/;
const threadPath = /^\/threads\/([^/]+)\/?$/;
const teamPath = /^\/teams\/([^/]+)\/?$/;
/** Static routes under /teams that are not team slugs. */
const reservedTeamPaths = new Set(["new"]);
/** Workspace pages with no record to look up. They only need a signed-in viewer. */
const workspacePath = /^\/(?:app(?:\/.*)?|inbox|teams(?:\/new)?)\/?$/;

function recordCheckFor(pathname: string): RouteCheck {
  const artifact = artifactPath.exec(pathname)?.[1];
  if (artifact) return { kind: "artifact", publicId: decodeURIComponent(artifact) };
  const thread = threadPath.exec(pathname)?.[1];
  if (thread) return { kind: "thread", publicId: decodeURIComponent(thread) };
  const team = teamPath.exec(pathname)?.[1];
  if (team && !reservedTeamPaths.has(team)) return { kind: "team", slug: decodeURIComponent(team) };
  return null;
}

/** Which check a request needs, or null to pass it through. Only page loads (GET, HEAD) are checked. */
export function routeCheckFor(method: string, pathname: string): RouteCheck {
  if (method !== "GET" && method !== "HEAD") return null;
  if (workspacePath.test(pathname)) return { kind: "workspace" };
  return recordCheckFor(pathname);
}

/**
 * The sign-in URL that brings the person back to `path` afterwards. `path` is
 * the request's own pathname (plus query), so it always stays on this site.
 */
export function signInPath(path: string): string {
  return `/sign-in?next=${encodeURIComponent(path)}`;
}
