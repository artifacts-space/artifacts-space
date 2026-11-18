import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FixtureLeaveProvider, type FixtureMoveMode } from "@/components/dev/fixture-leave";
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

/** `?leaving=<n>`: how many of the viewer's artifacts live in the team (7 when unset, at most 150). */
function leavingFrom(value: string | string[] | undefined): number {
  const count = Number(value ?? 7);
  return Number.isInteger(count) && count >= 0 ? Math.min(count, 150) : 7;
}

const moveModes: readonly FixtureMoveMode[] = ["apply", "wait", "refuse"];

function moveModeFrom(value: string | string[] | undefined): FixtureMoveMode {
  return moveModes.find((mode) => mode === value) ?? "apply";
}

/**
 * Development-only page for the team page e2e test: the real team page with
 * fixture data and no database. `?as=member|admin|owner` picks the viewer's
 * role, `?personal=1` shows a personal team, `?icon=1` gives the team an
 * icon (a static image standing in for the members-only route),
 * `?icon=broken` an icon URL that fails to load, `?leaving=<n>` how many
 * of the viewer's artifacts live in the team (Leave team lists them),
 * `?move=wait|refuse` what moving the first of them to Personal does, and
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
      <FixtureLeaveProvider members={data.members} viewerId={data.viewerId} count={leavingFrom(params.leaving)} mode={moveModeFrom(params.move)}>
        <TeamPageView data={data} selection={parseTeamTabs(params, teamTabAccess(data.team, data.reports.length))} />
      </FixtureLeaveProvider>
    </ConfirmationsProvider>
  );
}
