import type { BetterAuthOptions } from "better-auth";

import { googleCredentials, googleIdentityProblem, type GoogleSignInEnv } from "@/lib/auth/google-sign-in-rules";

/** The environment values the social sign-in providers read. */
export interface SocialAuthEnv extends GoogleSignInEnv {
  GITHUB_CLIENT_ID?: string | undefined;
  GITHUB_CLIENT_SECRET?: string | undefined;
}

/** The social sign-in values from this deploy's environment. */
export function socialAuthEnv(): SocialAuthEnv {
  return {
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

function githubProvider(env: SocialAuthEnv) {
  const { GITHUB_CLIENT_ID: clientId, GITHUB_CLIENT_SECRET: clientSecret } = env;
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

function googleProvider(env: SocialAuthEnv) {
  const credentials = googleCredentials(env);
  if (!credentials) return {};
  // Better Auth asks for openid, email, and profile only. No username comes
  // from Google; the create hook suggests one from the email address.
  return { google: { ...credentials, prompt: "select_account" as const } };
}

/** Better Auth's `socialProviders`: GitHub and Google, each only when it is configured. */
export function socialProviders(env: SocialAuthEnv) {
  return { ...githubProvider(env), ...googleProvider(env) };
}

/**
 * Account linking. A sign-in with GitHub or Google whose email matches an
 * existing account joins that account only when both sides have proved the
 * address: the provider says it verified the email, and the account's own
 * email is confirmed. No provider is trusted to skip that check, so
 * `trustedProviders` stays empty: listing a provider there would link it on
 * an email it never verified. Better Auth always requires the account's own
 * email to be confirmed (its deprecated `requireLocalEmailVerified` option,
 * on by default, is becoming unconditional), and
 * `social-account-linking.test.ts` checks that it does.
 */
export const accountLinking = {
  enabled: true,
  trustedProviders: [],
  allowDifferentEmails: false,
  disableImplicitLinking: false,
} satisfies NonNullable<NonNullable<BetterAuthOptions["account"]>["accountLinking"]>;

/**
 * Better Auth's `user.validateUserInfo` gate. It refuses a Google identity
 * whose email Google has not verified, so it can neither create an account
 * nor join one. Everything else passes.
 */
export const validateUserInfo: NonNullable<NonNullable<BetterAuthOptions["user"]>["validateUserInfo"]> = (data) =>
  googleIdentityProblem(data);
