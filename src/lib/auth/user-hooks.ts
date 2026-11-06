import { ensureUserSetup, pickUsername } from "@/lib/teams/setup";

interface NewUser {
  id: string;
  email: string;
  name: string;
  username?: unknown;
}

/**
 * Better Auth database hooks for users. On create, the user gets a checked,
 * unique username and then a personal team. On update, usernames never change
 * through Better Auth: the app changes them in one statement with the
 * personal team's slug (see changeUsername).
 */
export const userHooks = {
  create: {
    before: async (data: { email: string; username?: unknown }) => {
      const preferred = typeof data.username === "string" ? data.username : null;
      const { username, confirmed } = await pickUsername({ preferred, email: data.email });
      return { data: { ...data, username, usernameConfirmed: confirmed } };
    },
    after: async (created: NewUser) => {
      try {
        await ensureUserSetup({
          id: created.id,
          email: created.email,
          name: created.name,
          username: typeof created.username === "string" ? created.username : null,
        });
      } catch (error) {
        // The workspace repeats this setup on the next visit, so sign-in still succeeds.
        console.error("[teams] Personal team setup failed after sign-up", error instanceof Error ? error.message : "unknown error");
      }
    },
  },
  update: {
    before: (data: Record<string, unknown>) =>
      Promise.resolve({ data: { ...data, username: undefined, usernameConfirmed: undefined } }),
  },
};
