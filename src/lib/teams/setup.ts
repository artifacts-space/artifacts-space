import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { team, teamMember, user } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { handleCandidates, suggestHandleFromEmail, validateHandle } from "@/lib/handles";

import { findPersonalTeam } from "./queries";

const CANDIDATES_PER_TRY = 20;

/** Handles from this list already used by a user or a team, other than `exceptUserId`'s own. */
async function takenHandles(candidates: string[], exceptUserId?: string) {
  const db = getDb();
  const userCondition = exceptUserId
    ? and(inArray(user.username, candidates), ne(user.id, exceptUserId))
    : inArray(user.username, candidates);
  const teamCondition = exceptUserId
    ? and(inArray(team.slug, candidates), sql`not (${team.personal} and ${team.createdBy} = ${exceptUserId})`)
    : inArray(team.slug, candidates);
  const [users, teams] = await Promise.all([
    db.select({ handle: user.username }).from(user).where(userCondition),
    db.select({ handle: team.slug }).from(team).where(teamCondition),
  ]);
  return new Set([...users, ...teams].map((row) => row.handle));
}

/** True when no other user or team uses this handle. */
export async function isHandleAvailable(handle: string, exceptUserId?: string) {
  const taken = await takenHandles([handle], exceptUserId);
  return !taken.has(handle);
}

/** The first free handle based on `base`: base, base-2, base-3, and so on. */
export async function findAvailableHandle(base: string) {
  const candidates = handleCandidates(base, CANDIDATES_PER_TRY);
  const taken = await takenHandles(candidates);
  const free = candidates.find((candidate) => !taken.has(candidate));
  if (free) return free;
  const random = randomUUID().replaceAll("-", "").slice(0, 6);
  return `${base.slice(0, 30)}-${random}`;
}

/**
 * Picks a username for a new user. A GitHub login is used as is when it is
 * valid and free, and then counts as chosen. Otherwise the email's local part
 * is the starting point, and the person confirms it once in the workspace.
 */
export async function pickUsername(input: { preferred?: string | null | undefined; email: string }) {
  const preferred = input.preferred?.trim().toLowerCase();
  if (preferred && !validateHandle(preferred) && (await isHandleAvailable(preferred))) {
    return { username: preferred, confirmed: true };
  }
  const username = await findAvailableHandle(suggestHandleFromEmail(input.email));
  return { username, confirmed: false };
}

interface SetupUser {
  id: string;
  email: string;
  name: string;
  username?: string | null | undefined;
}

async function assignUsername(setupUser: SetupUser) {
  const username = await findAvailableHandle(suggestHandleFromEmail(setupUser.email));
  const [updated] = await getDb()
    .update(user)
    .set({ username, usernameConfirmed: false, updatedAt: new Date() })
    .where(and(eq(user.id, setupUser.id), isNull(user.username)))
    .returning();
  if (updated?.username) return updated.username;
  const [current] = await getDb().select({ username: user.username }).from(user).where(eq(user.id, setupUser.id)).limit(1);
  if (!current?.username) throw new Error("The username could not be assigned.");
  return current.username;
}

async function insertPersonalTeam(setupUser: SetupUser, username: string) {
  const [inserted] = await getDb()
    .insert(team)
    .values({
      id: randomUUID(),
      name: setupUser.name.trim() || username,
      slug: username,
      personal: true,
      teamSharingNeedsApproval: false,
      createdBy: setupUser.id,
    })
    .onConflictDoNothing()
    .returning();
  return inserted?.id ?? (await findPersonalTeam(setupUser.id))?.id ?? null;
}

/** The slug was taken by another team: move the user to a free handle and ask them to confirm it. */
async function moveToFreeUsername(setupUser: SetupUser, username: string) {
  const next = await findAvailableHandle(username);
  await getDb().update(user).set({ username: next, usernameConfirmed: false, updatedAt: new Date() }).where(eq(user.id, setupUser.id));
  return next;
}

/**
 * Makes sure the user has a username and a personal team they own. Safe to
 * call any number of times; it only fills in what is missing. Returns the
 * user's username.
 */
export async function ensureUserSetup(setupUser: SetupUser) {
  let username = setupUser.username ?? (await assignUsername(setupUser));
  let teamId = (await findPersonalTeam(setupUser.id))?.id ?? (await insertPersonalTeam(setupUser, username));
  if (!teamId) {
    username = await moveToFreeUsername(setupUser, username);
    teamId = await insertPersonalTeam(setupUser, username);
  }
  if (!teamId) throw new Error("The personal team could not be created.");
  await getDb()
    .insert(teamMember)
    .values({ id: randomUUID(), teamId, userId: setupUser.id, role: "owner" })
    .onConflictDoNothing();
  return username;
}

export type ChangeUsernameResult = { ok: true; username: string } | { ok: false; error: string };

/**
 * Sets the user's username and their personal team's slug together, in one
 * statement, and marks the username as chosen.
 */
export async function changeUsername(userId: string, username: string): Promise<ChangeUsernameResult> {
  const problem = validateHandle(username);
  if (problem) return { ok: false, error: problem };
  if (!(await isHandleAvailable(username, userId))) return { ok: false, error: "That name is taken. Try another one." };
  try {
    await getDb().execute(sql`
      with updated as (
        update ${user} set username = ${username}, username_confirmed = true, updated_at = now()
        where id = ${userId} returning id
      )
      update ${team} set slug = ${username}
      where personal and created_by in (select id from updated)
    `);
    return { ok: true, username };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "That name was just taken. Try another one." };
    throw error;
  }
}
