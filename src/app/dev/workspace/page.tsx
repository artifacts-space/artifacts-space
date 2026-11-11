import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkspaceFixture, type FixtureWelcome } from "@/components/dev/workspace-fixture";
import { parseArtifactLink } from "@/lib/app-link";
import { parseProjectFilter, parseTagFilter } from "@/lib/projects/filter-params";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Workspace fixture",
  robots: { index: false, follow: false },
};

/**
 * Development-only page for the app shell e2e test: the /app workspace with
 * long artifacts, a long list, and projects, without a database. The
 * project filter in the URL works as on /app, and so does the
 * `?artifact=<id>&comments=1` link. `?scopes=1` adds shared teams, so the
 * workspace switcher lists them, and `&team=<slug>` opens one as the scope. `?linkcheck=failed`
 * acts as if the server could not check the link, and `?slowload=1` makes the
 * Long markdown fixture load on open, held until a test releases it. `?many=1`
 * adds 300 older notes (the list holds the newest 100), and `?tag=launch`
 * filters by tag as on /app. `&welcome=1` shows a new member's welcome card
 * on the team workspace `&team=<slug>` opens; `&welcome=fails` makes its
 * "Got it" save fail. Returns 404 in every other environment.
 */
/** `?welcome=1` shows the welcome card, `?welcome=fails` shows it with a refused save. */
function fixtureWelcome(param: string | string[] | undefined): FixtureWelcome {
  if (param === "1") return "on";
  return param === "fails" ? "fails" : "off";
}

export default async function WorkspaceFixturePage({ searchParams }: PageProps<"/dev/workspace">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  return <WorkspaceFixture projectFilter={parseProjectFilter(params)} link={parseArtifactLink(params)} linkFailed={params.linkcheck === "failed"} slowLoad={params.slowload === "1"} scopes={params.scopes === "1"} team={typeof params.team === "string" ? params.team : null} many={params.many === "1"} tags={parseTagFilter(params)} welcome={fixtureWelcome(params.welcome)} />;
}
