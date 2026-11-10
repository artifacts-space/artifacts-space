import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Dashboard } from "@/components/app/dashboard";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { enforceRateLimit } from "@/lib/abuse/rate-limit";
import { parseArtifactLink, type ArtifactLink } from "@/lib/app-link";
import { toArtifactListItem } from "@/lib/artifact-preview";
import { loadArtifactForViewer } from "@/lib/artifact-read";
import type { ArtifactDto, ArtifactListItemDto } from "@/lib/artifact-types";
import { listArtifacts, listProjectFacets, listTagFacets } from "@/lib/artifacts";
import { parseProjectFilter, parseTagFilter, projectFilterId } from "@/lib/projects/filter-params";
import { listSidebarProjects } from "@/lib/projects/sidebar-queries";
import { toSidebarRows } from "@/lib/projects/sidebar-rules";
import { getSession } from "@/lib/session";
import { siteOrigin } from "@/lib/site-origin";
import { listTeamsForUser } from "@/lib/teams/queries";

export const metadata: Metadata = { title: "Artifacts" };
// Reads the signed-in session, so it renders per request.
export const instant = false;

/** The shared team the URL asks for, null for the viewer's own artifacts; 404 for a team they are not in. */
function scopeTeamFor(teams: ShareTeam[], teamParam: string | string[] | undefined): ShareTeam | null {
  const slug = typeof teamParam === "string" ? teamParam : null;
  if (!slug) return null;
  const team = teams.find((item) => item.slug === slug && !item.personal);
  if (!team) notFound();
  return team;
}

/**
 * The linked artifact when it is not in the list already (someone else's,
 * shared by link, or outside the current filters), loaded through the one
 * access check. Null when it is in the list, missing, or not readable.
 */
async function linkedOutsideList(link: ArtifactLink | null, listed: ArtifactListItemDto[], viewerId: string): Promise<ArtifactDto | null> {
  if (!link || listed.some((item) => item.publicId === link.publicId)) return null;
  try {
    await enforceRateLimit("readByUser", viewerId);
    return (await loadArtifactForViewer(link.publicId, viewerId))?.dto ?? null;
  } catch (error) {
    console.error("[app] A linked artifact could not be loaded", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

export default async function AppPage({ searchParams }: PageProps<"/app">) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [params, memberships] = await Promise.all([searchParams, listTeamsForUser(session.user.id)]);
  const teams: ShareTeam[] = memberships.map(({ id, slug, name, personal, role, roleKey, kind, capabilities, teamSharingNeedsApproval }) => ({ id, slug, name, personal, role, roleKey, kind, capabilities, teamSharingNeedsApproval }));
  const scopeTeam = scopeTeamFor(teams, params.team);

  // Previews only: content loads when an artifact is opened (loadArtifactAction).
  const scope = scopeTeam ? { kind: "team" as const, teamId: scopeTeam.id } : { kind: "mine" as const };
  const projectFilter = parseProjectFilter(params);
  const tagFilter = parseTagFilter(params);
  const [artifacts, facets, tagFacets, projectSources] = await Promise.all([
    listArtifacts(session.user.id, { scope, project: projectFilter ?? undefined, tags: tagFilter }),
    listProjectFacets(session.user.id, scope),
    listTagFacets(session.user.id, scope),
    listSidebarProjects(session.user.id, scope),
  ]);
  // A link (from a notification, say) opens its artifact even when the list does not hold it: the workspace pins it to the top.
  const link = parseArtifactLink(params);
  const linked = await linkedOutsideList(link, artifacts, session.user.id);
  // Null for a link to an artifact that is gone or not readable: the workspace says so.
  const linkTarget = link ? (artifacts.find((item) => item.publicId === link.publicId) ?? (linked ? toArtifactListItem(linked) : null)) : null;

  return (
    <Dashboard
      key={`${scopeTeam?.id ?? "mine"}:${projectFilterId(projectFilter)}:${tagFilter.join(",")}`}
      facets={facets}
      projectRows={toSidebarRows(projectSources, teams)}
      projectFilter={projectFilter}
      tagFilter={tagFilter}
      tagFacets={tagFacets}
      initialArtifacts={artifacts}
      {...(linked ? { initialFull: [linked] } : {})}
      link={link}
      linkTarget={linkTarget}
      origin={siteOrigin()}
      viewerId={session.user.id}
      teams={teams}
      scopeTeam={scopeTeam}
    />
  );
}
