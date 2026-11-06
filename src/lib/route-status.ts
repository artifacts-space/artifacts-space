/**
 * Pure routing decisions for src/proxy.ts, which answers with real HTTP
 * statuses before a page starts streaming (once a Cache Components page
 * streams, its status is fixed at 200).
 */

export type RouteCheck = { kind: "artifact"; publicId: string } | { kind: "team"; slug: string } | null;

const artifactPath = /^\/artifact\/([^/]+)\/?$/;
const teamPath = /^\/teams\/([^/]+)\/?$/;
/** Static routes under /teams that are not team slugs. */
const reservedTeamPaths = new Set(["new"]);

/** Which check a request needs, or null to pass it through. Only page loads (GET, HEAD) are checked. */
export function routeCheckFor(method: string, pathname: string): RouteCheck {
  if (method !== "GET" && method !== "HEAD") return null;
  const artifact = artifactPath.exec(pathname)?.[1];
  if (artifact) return { kind: "artifact", publicId: decodeURIComponent(artifact) };
  const team = teamPath.exec(pathname)?.[1];
  if (team && !reservedTeamPaths.has(team)) return { kind: "team", slug: decodeURIComponent(team) };
  return null;
}

/** The sign-in URL that brings the person back to `pathname` afterwards. */
export function signInPath(pathname: string): string {
  return `/sign-in?next=${encodeURIComponent(pathname)}`;
}
