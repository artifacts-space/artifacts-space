/**
 * Which avatar stands for a workspace: the viewer's own pixel avatar for
 * their personal workspace, a team's uploaded icon when it has one, and
 * otherwise a pixel avatar drawn from the team id. Pure and client-safe, so
 * the server and the browser pick the same avatar.
 */

/** The fields of a team that decide its avatar. */
export interface AvatarTeam {
  id: string;
  personal: boolean;
  /** The members-only icon URL, or null or left out when the team has none. */
  iconUrl?: string | null | undefined;
}

/** What to draw: a person's pixel avatar, a team's uploaded image, or a team's pixel avatar. */
export type TeamAvatar =
  | { kind: "person"; seed: string }
  | { kind: "image"; url: string; fallbackSeed: string }
  | { kind: "team"; seed: string };

/**
 * The avatar for a workspace. `team` is null for the viewer's own artifacts.
 * A personal team is only its owner, the viewer, so it shows the viewer's
 * avatar, as the header does. Any other team shows its icon, or the pixel
 * avatar seeded by its id (stable across renames), which also stands in when
 * the icon cannot load.
 */
export function teamAvatar(team: AvatarTeam | null, viewerId: string): TeamAvatar {
  if (!team || team.personal) return { kind: "person", seed: viewerId };
  if (team.iconUrl) return { kind: "image", url: team.iconUrl, fallbackSeed: team.id };
  return { kind: "team", seed: team.id };
}
