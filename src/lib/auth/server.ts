import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { sendMagicLinkEmail } from "@/lib/auth/magic-link-email";

const tenMinutes = 60 * 10;

function githubProvider() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return {};
  return { github: { clientId, clientSecret } };
}

function createAuth() {
  return betterAuth({
    appName: "artifacts.space",
    // Better Auth falls back to the request origin when this is unset.
    ...(process.env.BETTER_AUTH_URL ? { baseURL: process.env.BETTER_AUTH_URL } : {}),
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    // Sign-in is GitHub or an emailed link. There are no passwords.
    emailAndPassword: { enabled: false },
    socialProviders: githubProvider(),
    plugins: [
      magicLink({
        expiresIn: tenMinutes,
        sendMagicLink: ({ email, url, token }) => sendMagicLinkEmail({ email, url, token }),
      }),
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
