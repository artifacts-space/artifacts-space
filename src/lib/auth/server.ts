import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { getDb } from "@/db";
import * as oauthSchema from "@/db/oauth-schema";
import * as schema from "@/db/schema";
import { sessionHooks } from "@/lib/auth/agent-guards";
import { sendMagicLinkEmail } from "@/lib/auth/magic-link-email";
import { oauthPlugins } from "@/lib/auth/oauth-plugins";
import { teamDepartureHook } from "@/lib/auth/team-departure";
import { closedTeamRoutesHook } from "@/lib/auth/closed-team-routes";
import { teamRoutesClosedOverHttp, teamsPlugin } from "@/lib/auth/teams-plugin";
import { userHooks } from "@/lib/auth/user-hooks";

const tenMinutes = 60 * 10;
const fiveMinutes = 60 * 5;
const oneDay = 60 * 60 * 24;
const thirtyDays = oneDay * 30;

/** Better Auth model names mapped to the app's tables. */
const authSchema = {
  user: schema.user,
  session: schema.session,
  account: schema.account,
  verification: schema.verification,
  organization: schema.team,
  member: schema.teamMember,
  invitation: schema.teamInvitation,
  // OAuth server for MCP clients (@better-auth/oauth-provider).
  oauthClient: oauthSchema.oauthClient,
  oauthResource: oauthSchema.oauthResource,
  oauthClientResource: oauthSchema.oauthClientResource,
  oauthRefreshToken: oauthSchema.oauthRefreshToken,
  oauthAccessToken: oauthSchema.oauthAccessToken,
  oauthConsent: oauthSchema.oauthConsent,
  oauthClientAssertion: oauthSchema.oauthClientAssertion,
};

function githubProvider() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return {};
  return {
    github: {
      clientId,
      clientSecret,
      // The GitHub login is the preferred username. The create hook checks it.
      mapProfileToUser: (profile: { login: string }) => ({ username: profile.login }),
    },
  };
}

function createAuth() {
  return betterAuth({
    appName: "artifacts.space",
    // Better Auth falls back to the request origin when this is unset.
    ...(process.env.BETTER_AUTH_URL ? { baseURL: process.env.BETTER_AUTH_URL } : {}),
    database: drizzleAdapter(getDb(), { provider: "pg", schema: authSchema }),
    /*
     * The session and user are kept in a signed cookie for 5 minutes, so most
     * signed-in requests skip the session query. Trade-off: a session deleted
     * on the server (not by signing out here) keeps working in that browser
     * for up to 5 minutes, and user fields in the session can be up to 5
     * minutes old; code that must be current reads the database (see
     * loadWorkspaceViewer). Signing out clears the cookie at once.
     */
    /*
     * A session lasts 30 days from the last day it was used: once a day a
     * signed-in request moves its expiry 30 days out. The renewed cookie
     * reaches the browser through src/proxy.ts, because server components
     * cannot set cookies. Sign-in never offers "don't remember me", so the
     * cookie always has a Max-Age and survives closing the browser.
     */
    session: { expiresIn: thirtyDays, updateAge: oneDay, cookieCache: { enabled: true, maxAge: fiveMinutes } },
    // Sign-in is GitHub or an emailed link. There are no passwords.
    emailAndPassword: { enabled: false },
    socialProviders: githubProvider(),
    user: {
      additionalFields: {
        // Settable on create only (the GitHub mapping). The update hook drops it.
        username: { type: "string", required: false, unique: true },
        usernameConfirmed: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    databaseHooks: { user: userHooks, session: sessionHooks },
    hooks: { before: closedTeamRoutesHook, after: teamDepartureHook },
    disabledPaths: teamRoutesClosedOverHttp,
    plugins: [
      magicLink({
        expiresIn: tenMinutes,
        sendMagicLink: ({ email, url, token }) => sendMagicLinkEmail({ email, url, token }),
      }),
      teamsPlugin(),
      ...oauthPlugins(),
      // Must stay last so server actions can set auth cookies.
      nextCookies(),
    ],
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

/**
 * The Better Auth server instance. Created on first use so that builds and
 * pages that never touch auth do not need the auth environment variables.
 */
export function getAuth() {
  auth ??= createAuth();
  return auth;
}
