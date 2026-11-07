import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProjectManager } from "@/components/projects/project-manager";
import { listScopeProjects } from "@/lib/projects/queries";
import type { ProjectScope } from "@/lib/projects/rules";
import { getSession } from "@/lib/session";
import { listTeamsForUser } from "@/lib/teams/queries";

export const metadata: Metadata = { title: "Projects" };
// Reads the signed-in session, so it renders per request.
export const instant = false;

/**
 * Manage projects: the person's own (for their private artifacts), or a
 * shared team's (`?team=<slug>`, members only). Rename, change the icon,
 * merge, and delete; artifacts are never deleted here.
 */
export default async function ProjectsPage({ searchParams }: PageProps<"/app/projects">) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [{ team: teamParam }, memberships] = await Promise.all([searchParams, listTeamsForUser(session.user.id)]);
  const sharedTeams = memberships.filter((team) => !team.personal).map(({ id, slug, name }) => ({ id, slug, name }));
  const slug = typeof teamParam === "string" ? teamParam : null;
  const team = slug ? sharedTeams.find((item) => item.slug === slug) ?? null : null;
  if (slug && !team) notFound();

  const scope: ProjectScope = team ? { kind: "team", teamId: team.id } : { kind: "user", userId: session.user.id };
  const projects = await listScopeProjects(scope);
  return <ProjectManager key={team?.id ?? "mine"} initialProjects={projects} teams={sharedTeams} team={team} />;
}
