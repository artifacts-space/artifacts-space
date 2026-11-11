import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { teamFixture } from "@/components/dev/team-fixture";
import { ConfirmationsProvider } from "@/components/confirmations-provider";
import { TeamPageView, teamTabAccess } from "@/components/teams/team-page-view";
import { teamRoles, type TeamRole } from "@/lib/teams/roles";
import { parseTeamTabs } from "@/lib/teams/team-tabs-rules";

// A development tool, not a navigation target: skip instant-navigation validation.
export const instant = false;

export const metadata: Metadata = {
  title: "Team fixture",
  robots: { index: false, follow: false },
};

/** `?icon=` values: a real image, or a path that 404s so the image fails to load. */
const fixtureIconUrls: ReadonlyMap<string, string> = new Map([
  ["1", "/artifacts-space-icon.png"],
  ["broken", "/dev-fixture-missing-team-icon.png"],
]);

function roleFrom(value: string | string[] | undefined): TeamRole {
  return teamRoles.find((role) => role === value) ?? "owner";
}

/**
 * Development-only page for the team page e2e test: the real team page with
 * fixture data and no database. `?as=member|admin|owner` picks the viewer's
 * role, `?personal=1` shows a personal team, `?icon=1` gives the team an
 * icon (a static image standing in for the members-only route),
 * `?icon=broken` an icon URL that fails to load, and
 * `?tab=` and `?view=` work as on /teams/<slug>. Returns 404 in every
 * other environment.
 */
export default async function TeamFixturePage({ searchParams }: PageProps<"/dev/team">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const fixture = teamFixture(roleFrom(params.as), params.personal === "1");
  const iconUrl = fixtureIconUrls.get(String(params.icon));
  const data = iconUrl && !fixture.team.personal ? { ...fixture, team: { ...fixture.team, iconUrl } } : fixture;
  return (
    <ConfirmationsProvider initial={[]}>
      <TeamPageView data={data} selection={parseTeamTabs(params, teamTabAccess(data.team, data.reports.length))} />
    </ConfirmationsProvider>
  );
}
