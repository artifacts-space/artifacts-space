import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { localDatabaseEnabled, localDatabaseSkipReason } from "./local-db";

/**
 * Database helpers for the invitation checks: invitations in any state,
 * what an invitation and a membership look like afterwards, and whether an
 * edit waited for approval. Local throwaway database only, like local-db.ts;
 * deleting the seeded team removes its invitations and members.
 */

let pool: Pool | null = null;

function db(): Pool {
  if (!localDatabaseEnabled()) throw new Error(localDatabaseSkipReason);
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/** Opens an invitation to `email` in a state, expiring `expiresInDays` from now (negative: already expired). Returns its id. */
export async function seedInvitation(input: { teamId: string; inviterId: string; email: string; role?: "member" | "admin"; status?: "pending" | "canceled" | "accepted" | "rejected"; expiresInDays?: number }): Promise<string> {
  const id = randomUUID();
  await db().query(
    `insert into team_invitation (id, team_id, email, role, status, expires_at, inviter_id) values ($1, $2, $3, $4, $5, now() + make_interval(days => $6), $7)`,
    [id, input.teamId, input.email, input.role ?? "member", input.status ?? "pending", input.expiresInDays ?? 7, input.inviterId],
  );
  return id;
}

/** An invitation's stored status and role. */
export async function invitationState(id: string): Promise<{ status: string; role: string | null }> {
  const result = await db().query<{ status: string; role: string | null }>(`select status, role from team_invitation where id = $1`, [id]);
  const row = result.rows[0];
  if (!row) throw new Error("No such invitation.");
  return row;
}

/** The open invitations to an address in a team: their roles and expiry times, newest first. */
export async function openInvitations(teamId: string, email: string): Promise<{ id: string; role: string | null; expiresAt: Date }[]> {
  const result = await db().query<{ id: string; role: string | null; expires_at: Date }>(
    `select id, role, expires_at from team_invitation where team_id = $1 and lower(email) = lower($2) and status = 'pending' and expires_at > now() order by created_at desc`,
    [teamId, email],
  );
  return result.rows.map((row) => ({ id: row.id, role: row.role, expiresAt: row.expires_at }));
}

/** The stored (Better Auth) role a user holds in a team, or null when they are not in it. */
export async function storedTeamRole(teamId: string, userId: string): Promise<string | null> {
  const result = await db().query<{ role: string }>(`select role from team_member where team_id = $1 and user_id = $2`, [teamId, userId]);
  return result.rows[0]?.role ?? null;
}

/** Removes a user from a team, so the dev user can join it again in the next run. */
export async function leaveTestTeam(teamId: string, userId: string): Promise<void> {
  await db().query(`delete from team_member where team_id = $1 and user_id = $2`, [teamId, userId]);
}

/** How many sharing requests and edit reviews wait for an artifact: zero when a team edit applied directly. */
export async function waitingReviews(publicId: string): Promise<number> {
  const result = await db().query<{ n: string }>(
    `select count(*) as n from sharing_request r join artifact a on a.id = r.artifact_id where a.public_id = $1 and r.status = 'pending'`,
    [publicId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

/** Closes this file's pool. */
export async function closeInviteDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
