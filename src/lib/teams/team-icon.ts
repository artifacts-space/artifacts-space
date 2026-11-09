import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { team, teamMember } from "@/db/schema";
import { deleteObject, putObject, R2Error, r2ConfigFromEnv, streamObject, type ObjectStream } from "@/lib/files/r2";
import { UserFacingError } from "@/lib/user-facing-error";

import { checkTeamIconBytes, parseTeamIconKey, TEAM_ICON_STORED_MAX_BYTES, teamIconKey, type TeamIconType } from "./team-icon-rules";

/**
 * Team icons in R2. The rules (team-icon-rules.ts) decide what is accepted
 * and who may change it; this file stores the bytes, swaps the key in
 * `team.logo`, deletes the old object, and reads the icon for members.
 */

const previousRowSchema = z.object({ previous: z.string().nullable() });

/**
 * Sets the team's icon key (null removes it) in one statement and returns
 * the key it replaced. The row is locked first, so two changes at once each
 * get the key the other one wrote, and every old object is deleted once.
 * Personal teams are never changed: null `updated` means nothing was.
 */
async function swapIconKey(teamId: string, next: string | null): Promise<{ updated: boolean; previous: string | null }> {
  const result = await getDb().execute(sql`
    with old as (select ${team.logo} as previous from ${team} where ${team.id} = ${teamId} and ${team.personal} = false for update)
    update ${team} set logo = ${next} from old where ${team.id} = ${teamId} and ${team.personal} = false
    returning old.previous as previous
  `);
  const [row] = z.array(previousRowSchema).parse(result.rows);
  return row ? { updated: true, previous: row.previous } : { updated: false, previous: null };
}

/** Deletes an icon object the team no longer uses. Best effort: a failure is logged and the team keeps working. */
async function deleteOldIcon(teamId: string, key: string | null): Promise<void> {
  if (!parseTeamIconKey(teamId, key) || !key) return;
  try {
    await deleteObject(r2ConfigFromEnv(), key);
  } catch (error) {
    console.error("[team-icon] Deleting the old icon failed", error instanceof Error ? error.name : "unknown error");
  }
}

/**
 * Stores checked bytes as the team's icon and deletes the one it replaces.
 * The caller has already checked that the person may change the icon
 * (canManageTeamIcon). Throws a UserFacingError when the bytes are refused.
 */
export async function saveTeamIcon(teamId: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const checked = checkTeamIconBytes(bytes);
  if (!checked.ok) throw new UserFacingError(checked.error);
  const config = r2ConfigFromEnv();
  const key = teamIconKey(teamId, randomUUID(), checked.image.type);
  await putObject(config, key, bytes, checked.image.type);
  let swapped: Awaited<ReturnType<typeof swapIconKey>>;
  try {
    swapped = await swapIconKey(teamId, key);
  } catch (error) {
    await deleteOldIcon(teamId, key);
    throw error;
  }
  if (!swapped.updated) {
    await deleteOldIcon(teamId, key);
    throw new UserFacingError("Personal teams have no icon.");
  }
  await deleteOldIcon(teamId, swapped.previous);
}

/** Removes the team's icon and deletes its object. Removing when there is none succeeds. */
export async function removeTeamIcon(teamId: string): Promise<void> {
  const swapped = await swapIconKey(teamId, null);
  if (!swapped.updated) throw new UserFacingError("Personal teams have no icon.");
  await deleteOldIcon(teamId, swapped.previous);
}

/**
 * The icon key of a shared team, read through the viewer's own membership
 * row: one statement, a join (never a correlated subquery, see AGENTS.md),
 * and no rows for anyone outside the team. Exported for its `.toSQL()` test.
 */
export function memberIconKeyQuery(db: Pick<ReturnType<typeof getDb>, "select">, viewerId: string, teamId: string) {
  return db
    .select({ logo: team.logo })
    .from(teamMember)
    .innerJoin(team, eq(team.id, teamMember.teamId))
    .where(and(eq(teamMember.userId, viewerId), eq(team.id, teamId), eq(team.personal, false)))
    .limit(1);
}

/** A member's view of the team icon: its bytes as a stream, their size, its type, and the id its URL carries as `v`. */
export interface MemberTeamIcon {
  body: ReadableStream<Uint8Array>;
  size: number;
  type: TeamIconType;
  id: string;
}

/**
 * The team's icon for `viewerId`, or null when they are not in the team, the
 * team is personal or has no icon, its stored key is not one this app made
 * for this team, or the object is gone. R2 is read only after the membership
 * check passes, and the bytes are streamed, never held in memory. Callers answer "not found" for null, so a team's icon never
 * shows outside the team.
 */
export async function memberTeamIcon(viewerId: string, teamId: string): Promise<MemberTeamIcon | null> {
  const [row] = await memberIconKeyQuery(getDb(), viewerId, teamId);
  const key = row?.logo ?? null;
  const parsed = parseTeamIconKey(teamId, key);
  if (!parsed || !key) return null;
  const object = await openStoredIcon(key);
  return object ? { ...object, type: parsed.type, id: parsed.id } : null;
}

/**
 * Opens a stored icon, or null when it is gone or over the stored cap. Icons
 * stored before the 512 KB cap could be up to 2 MB; those show the team's
 * letter (the route's 404) until someone uploads a new one, never an error.
 */
async function openStoredIcon(key: string): Promise<ObjectStream | null> {
  try {
    return await streamObject(r2ConfigFromEnv(), key, TEAM_ICON_STORED_MAX_BYTES);
  } catch (error) {
    if (!(error instanceof R2Error) || error.status !== 413) throw error;
    console.error("[team-icon] A stored icon is over the size cap", error.name);
    return null;
  }
}
