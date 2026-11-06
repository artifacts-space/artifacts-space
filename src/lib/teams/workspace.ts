import { eq } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db";
import { user } from "@/db/schema";

import { listTeamsForUser } from "./queries";
import { ensureUserSetup } from "./setup";

interface SessionUser {
  id: string;
  email: string;
  name: string;
  username?: string | null | undefined;
  usernameConfirmed?: boolean | null | undefined;
}

/**
 * Username fields that are current. The session cookie cache can hold them
 * for up to 5 minutes, so a person who just chose a username would see the
 * onboarding again; until the session says confirmed, read the database.
 */
async function currentUsername(sessionUser: SessionUser) {
  if (sessionUser.usernameConfirmed === true && sessionUser.username) return { username: sessionUser.username, usernameConfirmed: true };
  const [row] = await getDb().select({ username: user.username, usernameConfirmed: user.usernameConfirmed }).from(user).where(eq(user.id, sessionUser.id)).limit(1);
  return { username: row?.username ?? sessionUser.username ?? null, usernameConfirmed: row?.usernameConfirmed === true };
}

/**
 * The signed-in person's username and teams for the workspace. Repairs a
 * missing username or personal team on the way, so a failed sign-up hook
 * never leaves someone without one. Deduplicated per request.
 */
export const loadWorkspaceViewer = cache(async (sessionUser: SessionUser) => {
  const [current, initialTeams] = await Promise.all([currentUsername(sessionUser), listTeamsForUser(sessionUser.id)]);
  let teams = initialTeams;
  let username = current.username;
  const personal = teams.find((team) => team.personal);
  if (!username || !personal) {
    username = await ensureUserSetup(sessionUser);
    teams = await listTeamsForUser(sessionUser.id);
  }
  return {
    username,
    usernameConfirmed: current.usernameConfirmed,
    teams,
  };
});
