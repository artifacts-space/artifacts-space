import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Dashboard } from "@/components/app/dashboard";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { listArtifacts } from "@/lib/artifacts";
import { getSession } from "@/lib/session";
import { siteOrigin } from "@/lib/site-origin";
import { listTeamsForUser } from "@/lib/teams/queries";

export const metadata: Metadata = { title: "Artifacts" };
// Reads the signed-in session, so it renders per request.
export const instant = false;

export default async function AppPage({ searchParams }: PageProps<"/app">) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [{ team: teamParam }, memberships] = await Promise.all([searchParams, listTeamsForUser(session.user.id)]);
  const teams: ShareTeam[] = memberships.map(({ id, slug, name, personal, role, teamSharingNeedsApproval }) => ({ id, slug, name, personal, role, teamSharingNeedsApproval }));
  const slug = typeof teamParam === "string" ? teamParam : null;
  const scopeTeam = slug ? teams.find((team) => team.slug === slug && !team.personal) ?? null : null;
  if (slug && !scopeTeam) notFound();

  const artifacts = await listArtifacts(session.user.id, { scope: scopeTeam ? { kind: "team", teamId: scopeTeam.id } : { kind: "mine" } });

  return (
    <Dashboard
      key={scopeTeam?.id ?? "mine"}
      initialArtifacts={artifacts}
      origin={siteOrigin()}
      viewerId={session.user.id}
      teams={teams}
      scopeTeam={scopeTeam}
    />
  );
}
