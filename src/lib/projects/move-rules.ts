/**
 * An artifact only ever goes into a project of its own home space: the
 * author's own projects, or those of the shared team it is shared with
 * (see rules.ts). A move onto a project in another space is refused, never
 * turned into a look-alike project; these words say what to do instead.
 */

/** A project space as a move describes it: the viewer's own, a team's, or another person's. */
export type MoveSpace = { kind: "own" } | { kind: "team"; name: string } | { kind: "other" };

/** Why an artifact whose home is `home` cannot go into `projectName`, which lives in `target`. */
export function crossSpaceMessage(projectName: string, target: MoveSpace, home: MoveSpace): string {
  if (target.kind === "team") return `Share it with ${target.name} first to put it in ${projectName}.`;
  if (home.kind === "team") return `Stop sharing it with ${home.name} first to put it in ${projectName}.`;
  return `It uses its author's projects, so it cannot go in ${projectName}.`;
}
