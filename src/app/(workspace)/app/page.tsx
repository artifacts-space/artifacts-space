import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Dashboard } from "@/components/app/dashboard";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { listArtifacts, listProjectFacets, listTagFacets } from "@/lib/artifacts";
import { parseProjectFilter, parseTagFilter, projectFilterId } from "@/lib/projects/filter-params";
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

export default async function AppPage({ searchParams }: PageProps<"/app">) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [params, memberships] = await Promise.all([searchParams, listTeamsForUser(session.user.id)]);
  const teams: ShareTeam[] = memberships.map(({ id, slug, name, personal, role, teamSharingNeedsApproval }) => ({ id, slug, name, personal, role, teamSharingNeedsApproval }));
  const scopeTeam = scopeTeamFor(teams, params.team);

  // Previews only: content loads when an artifact is opened (loadArtifactAction).
  const scope = scopeTeam ? { kind: "team" as const, teamId: scopeTeam.id } : { kind: "mine" as const };
  const projectFilter = parseProjectFilter(params);
  const tagFilter = parseTagFilter(params);
  const [artifacts, facets, tagFacets] = await Promise.all([
    listArtifacts(session.user.id, { scope, project: projectFilter ?? undefined, tags: tagFilter }),
    listProjectFacets(session.user.id, scope),
    listTagFacets(session.user.id, scope),
  ]);

  return (
    <Dashboard
      key={`${scopeTeam?.id ?? "mine"}:${projectFilterId(projectFilter)}:${tagFilter.join(",")}`}
      facets={facets}
      projectFilter={projectFilter}
      tagFilter={tagFilter}
      tagFacets={tagFacets}
      initialArtifacts={artifacts}
      origin={siteOrigin()}
      viewerId={session.user.id}
      teams={teams}
      scopeTeam={scopeTeam}
    />
  );
}
