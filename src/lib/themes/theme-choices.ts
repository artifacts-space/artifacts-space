import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { team } from "@/db/schema";
import { listTeamsForUser, type TeamMembership } from "@/lib/teams/queries";

import { loadArtifactThemeContext, type ThemeSubject } from "./artifact-theme-context";
import { noThemeChoices, type ThemeChoiceGroup, type ThemeChoices } from "./theme-choice-types";
import { listPresetsForTeams } from "./team-presets";
import { manageableTeams, resolveArtifactTheme, themeTeamId } from "./team-preset-rules";

/**
 * What the artifact theme picker offers one viewer: the built-ins (always),
 * the team presets they may use, grouped by team, and the theme an artifact
 * inherits when it has none of its own. Only members ever receive a team's
 * presets: readers outside a team never reach this.
 */

type TeamRow = TeamMembership;

/** The viewer's shared teams, or just `onlyTeamId` when given (and they belong to it), with their capabilities there. */
async function viewerTeams(viewerId: string, onlyTeamId?: string): Promise<TeamRow[]> {
  const teams = await listTeamsForUser(viewerId);
  return teams.filter((row) => !row.personal && (onlyTeamId === undefined || row.id === onlyTeamId));
}

async function groupsFor(teams: readonly TeamRow[]): Promise<ThemeChoiceGroup[]> {
  const presets = await listPresetsForTeams(teams.map((row) => row.id));
  return teams.flatMap((row) => {
    const list = presets.get(row.id) ?? [];
    if (list.length === 0) return [];
    return [{ teamId: row.id, teamName: row.name, presets: list.map(({ ref, name, description, theme }) => ({ ref, name, description, theme })) }];
  });
}

/** Choices for a new artifact: it starts private, so the presets of every shared team the viewer belongs to. */
export async function newArtifactThemeChoices(viewerId: string): Promise<ThemeChoices> {
  const teams = await viewerTeams(viewerId);
  return { groups: await groupsFor(teams), inherited: null, manageable: manageableTeams(teams) };
}

async function teamPersonal(teamId: string | null): Promise<boolean | null> {
  if (!teamId) return null;
  const [row] = await getDb().select({ personal: team.personal }).from(team).where(eq(team.id, teamId)).limit(1);
  return row?.personal ?? null;
}

/**
 * Choices for an artifact the viewer may edit: its theme team's presets (when
 * the viewer belongs to that team) and its team default; or, with no theme
 * team, the presets of the author's shared teams, offered only to the author.
 * `manageable` lists the same teams where the viewer may manage themes.
 */
export async function artifactThemeChoices(viewerId: string, subject: ThemeSubject): Promise<ThemeChoices> {
  const themeTeam = themeTeamId(subject, await teamPersonal(subject.visibility === "private" ? null : subject.teamId));
  if (!themeTeam) {
    if (subject.userId !== viewerId) return noThemeChoices;
    return newArtifactThemeChoices(viewerId);
  }
  const teams = await viewerTeams(viewerId, themeTeam);
  const [groups, context] = await Promise.all([groupsFor(teams), loadArtifactThemeContext(subject, [])]);
  const manageable = manageableTeams(teams);
  if (context.teamDefault === null) return { groups, inherited: null, manageable };
  const inherited = resolveArtifactTheme(null, context);
  return { groups, inherited: inherited.source === "team" ? { name: inherited.name, theme: inherited.theme } : null, manageable };
}
