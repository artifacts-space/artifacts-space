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
import { sessionConfig } from "@/lib/auth/session-config";
import { accountLinking, socialAuthEnv, socialProviders, validateUserInfo } from "@/lib/auth/social-auth-options";
import { teamDepartureHook } from "@/lib/auth/team-departure";
import { closedTeamRoutesHook } from "@/lib/auth/closed-team-routes";
import { teamRoutesClosedOverHttp, teamsPlugin } from "@/lib/auth/teams-plugin";
import { userHooks } from "@/lib/auth/user-hooks";

const tenMinutes = 60 * 10;

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

function createAuth() {
  return betterAuth({
    appName: "artifacts.space",
    // Better Auth falls back to the request origin when this is unset.
    ...(process.env.BETTER_AUTH_URL ? { baseURL: process.env.BETTER_AUTH_URL } : {}),
    database: drizzleAdapter(getDb(), { provider: "pg", schema: authSchema }),
    session: sessionConfig,
    // Sign-in is GitHub, Google, or an emailed link. There are no passwords.
    emailAndPassword: { enabled: false },
    socialProviders: socialProviders(socialAuthEnv()),
    account: { accountLinking },
    user: {
      validateUserInfo,
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
