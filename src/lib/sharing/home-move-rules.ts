/**
 * An artifact's home workspace, as the browser tells it, and the words for
 * moving between homes. Every artifact has one home (artifactHomeScope in
 * src/lib/projects/rules.ts): the shared team it is shared through, else its
 * author's Personal workspace. Only the home workspace lists it
 * (src/lib/artifact-list-scope.ts is the same rule in SQL). So sharing with
 * a team is a move: the artifact leaves Personal and is in the team's
 * workspace. Sharing by link or in public through the viewer's personal team
 * moves nothing; through a shared team it moves there too.
 * Pure and client-safe.
 */

/** A team, as these rules read it. */
export interface HomeTeam {
  id: string;
  slug: string;
  name: string;
  personal: boolean;
}

/** The fields of an artifact that decide its home. */
export interface HomeSubject {
  visibility: string;
  teamId: string | null;
}

/**
 * The shared team that is the artifact's home, among the viewer's teams, or
 * null when its home is not one of them: it is private, it names no team, it
 * names the viewer's personal team, or it names a team the viewer is not in.
 */
export function homeTeamOf<T extends HomeTeam>(subject: HomeSubject, teams: readonly T[]): T | null {
  if (subject.visibility === "private" || subject.teamId === null) return null;
  const team = teams.find((item) => item.id === subject.teamId);
  return team && !team.personal ? team : null;
}

/**
 * True when a workspace lists the artifact: the team's workspace for an
 * artifact whose home is that team, Personal (`scopeTeamId` null) for every
 * other one the viewer has there.
 */
export function listedInWorkspace(subject: HomeSubject, teams: readonly HomeTeam[], scopeTeamId: string | null): boolean {
  return (homeTeamOf(subject, teams)?.id ?? null) === scopeTeamId;
}

/** A change of home: into a team's workspace (from Personal, or from another team's), or back to Personal. */
export type HomeMove = { to: "team"; team: HomeTeam; from: HomeTeam | null } | { to: "personal"; from: HomeTeam };

/** The move a sharing change makes, or null when the artifact stays where it is. */
export function homeMove(before: HomeSubject, after: HomeSubject, teams: readonly HomeTeam[]): HomeMove | null {
  const from = homeTeamOf(before, teams);
  const to = homeTeamOf(after, teams);
  if ((from?.id ?? null) === (to?.id ?? null)) return null;
  if (to) return { to: "team", team: to, from };
  return from ? { to: "personal", from } : null;
}

/** The name of the workspace a move ends in. */
export function destinationName(move: HomeMove): string {
  return move.to === "team" ? move.team.name : "Personal";
}

/** What the place it leaves is called in a sentence. */
function leaves(move: HomeMove): string {
  return move.from ? move.from.name : "your personal artifacts";
}

/**
 * The Share dialog's button. It names the move when saving makes one, so the
 * verb matches what happens; while the team's rule needs an approval, saving
 * only asks. "Save" when the artifact stays where it is.
 */
export function saveLabel(move: HomeMove | null, outcome: "apply" | "pending"): string {
  if (!move) return "Save";
  return outcome === "pending" ? `Ask to move to ${destinationName(move)}` : `Move to ${destinationName(move)}`;
}

/** The team picker's label for team sharing: "Move to" while picking a team moves the artifact there, "Team" once it is there. */
export function teamPickerLabel(move: HomeMove | null): string {
  return move?.to === "team" ? "Move to" : "Team";
}

/**
 * The sentence in the Share dialog that says saving moves the artifact, and
 * what it leaves. While the change waits for an approval, nothing moves
 * until it is approved, and the sentence says so.
 */
export function moveSentence(move: HomeMove, outcome: "apply" | "pending"): string {
  if (move.to === "personal") return `It moves back to your personal artifacts and leaves ${move.from.name}.`;
  const rest = `moves to ${move.team.name} and leaves ${leaves(move)}.`;
  return outcome === "pending" ? `Once approved, it ${rest}` : `It ${rest}`;
}

/** The toast after a move took effect: where the artifact went. */
export function movedMessage(title: string, move: HomeMove): string {
  const name = title.trim() || "Untitled artifact";
  return move.to === "team" ? `Moved “${name}” to ${move.team.name}.` : `Moved “${name}” back to Personal.`;
}

/** The toast after Undo brought a moved artifact back to the workspace that shows it (`teamName` null for Personal). */
export function returnedMessage(title: string, teamName: string | null): string {
  const name = title.trim() || "Untitled artifact";
  return `“${name}” is back in ${teamName ?? "your personal artifacts"}.`;
}

/** The toast's action: open the workspace it went to, with the artifact open. */
export function openLabel(move: HomeMove): string {
  return `Open in ${destinationName(move)}`;
}

/** The address of an artifact, open in a workspace: `listPath` is the workspace's path, `teamSlug` null for Personal. */
export function workspaceArtifactHref(listPath: string, teamSlug: string | null, publicId: string): string {
  const params = new URLSearchParams();
  if (teamSlug) params.set("team", teamSlug);
  params.set("artifact", publicId);
  return `${listPath}?${params.toString()}`;
}

/** Where a move's "Open in" action goes. */
export function moveHref(listPath: string, move: HomeMove, publicId: string): string {
  return workspaceArtifactHref(listPath, move.to === "team" ? move.team.slug : null, publicId);
}

/** A list item, as a save changes it. */
interface Listed extends HomeSubject {
  id: string;
}

/**
 * A workspace's list after one artifact was saved. It is replaced in place
 * while this workspace still lists it. When the save moved it to another
 * workspace, it leaves the list at once. An artifact a link opened here,
 * which this workspace never listed, stays while it is open.
 */
export function listAfterSave<T extends Listed>(current: readonly T[], saved: T, teams: readonly HomeTeam[], scopeTeamId: string | null): T[] {
  const known = current.find((item) => item.id === saved.id);
  if (!known) return [...current];
  const leaves = listedInWorkspace(known, teams, scopeTeamId) && !listedInWorkspace(saved, teams, scopeTeamId);
  if (leaves) return current.filter((item) => item.id !== saved.id);
  return current.map((item) => (item.id === saved.id ? saved : item));
}

/** The list with an artifact an undone move brought back: first, as the newest change, and with no other copy of it. */
export function listWithReturned<T extends { id: string }>(current: readonly T[], returned: T): T[] {
  return [returned, ...current.filter((item) => item.id !== returned.id)];
}

/** The fields of a row that decide whether it names another workspace. */
interface RowSubject extends HomeSubject {
  /** True when the viewer wrote it, or acts for the agent that did. */
  own: boolean;
}

/**
 * The workspace a row names when its artifact's home is not the workspace
 * that shows it: the team's name, or "Personal" for the viewer's own. A
 * workspace's lists hold only its own artifacts, so this is only ever an
 * artifact a link opened here. Null for a row at home, and for someone
 * else's artifact that has no workspace of the viewer's.
 */
export function elsewhereName(subject: RowSubject, teams: readonly HomeTeam[], scopeTeamId: string | null): string | null {
  const home = homeTeamOf(subject, teams);
  if ((home?.id ?? null) === scopeTeamId) return null;
  if (home) return home.name;
  return subject.own ? "Personal" : null;
}
