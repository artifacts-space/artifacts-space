import { cache } from "react";

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
 * The signed-in person's username and teams for the workspace. Repairs a
 * missing username or personal team on the way, so a failed sign-up hook
 * never leaves someone without one. Deduplicated per request.
 */
export const loadWorkspaceViewer = cache(async (sessionUser: SessionUser) => {
  let teams = await listTeamsForUser(sessionUser.id);
  let username = sessionUser.username ?? null;
  const personal = teams.find((team) => team.personal);
  if (!username || !personal) {
    username = await ensureUserSetup(sessionUser);
    teams = await listTeamsForUser(sessionUser.id);
  }
  return {
    username,
    usernameConfirmed: sessionUser.usernameConfirmed === true,
    teams,
  };
});
