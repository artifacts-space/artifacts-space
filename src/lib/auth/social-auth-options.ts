import type { Account, BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

import { googleCredentials, googleIdentityProblem, isRealCredential, type GoogleSignInEnv } from "@/lib/auth/google-sign-in-rules";
import { forbiddenSocialField, socialStartPaths } from "@/lib/auth/social-request-rules";

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
  // Blank values and replace-with-… placeholders count as unset, as for Google.
  if (!isRealCredential(clientId) || !isRealCredential(clientSecret)) return {};
  return {
    github: {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      // The GitHub login is the preferred username. The create hook checks it.
      mapProfileToUser: (profile: { login: string }) => ({ username: profile.login }),
    },
  };
}

function googleProvider(env: SocialAuthEnv) {
  const credentials = googleCredentials(env);
  if (!credentials) return {};
  // No username comes from Google; the create hook suggests one from the email address.
  return {
    google: {
      ...credentials,
      prompt: "select_account" as const,
      // openid, email, and profile only: no scopes granted to this client
      // earlier ride along, and socialSignInGuard refuses extra ones.
      includeGrantedScopes: false,
      // Sign-in goes through Google's own pages only. A bare ID token posted
      // to /sign-in/social or /link-social would skip the browser flow.
      disableIdTokenSignIn: true,
    },
  };
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
 * Better Auth's `user.validateUserInfo` gate (googleIdentityProblem). It
 * refuses a Google identity whose email Google has not verified, at every
 * step, and one whose address Google is not the authority for when it would
 * create or join an account. Everything else passes.
 */
export const validateUserInfo: NonNullable<NonNullable<BetterAuthOptions["user"]>["validateUserInfo"]> = (data) =>
  googleIdentityProblem(data);

/**
 * Refuses a GitHub or Google sign-in or link request that asks the provider
 * for more than the server does: its own `scopes` or `additionalParams`
 * (social-request-rules.ts). A Better Auth plugin, so it runs on the HTTP
 * route and on direct server calls alike.
 */
export function socialSignInGuard() {
  return {
    id: "social-sign-in-guard",
    hooks: {
      before: [
        {
          matcher: (context) => socialStartPaths.has(context.path ?? ""),
          handler: createAuthMiddleware((ctx) => {
            const field = forbiddenSocialField(ctx.body);
            if (field) throw new APIError("BAD_REQUEST", { code: "social_field_not_allowed", message: `Sign-in requests cannot set ${field}.` });
            return Promise.resolve();
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

/** Token columns Better Auth fills from a provider. */
const tokenColumns = { accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null } as const;

/** Drops Google's tokens from an account row; any other provider's row is returned unchanged. */
function withoutGoogleTokens<T extends { providerId?: string | undefined }>(account: T): T {
  return account.providerId === "google" ? { ...account, ...tokenColumns } : account;
}

/**
 * Better Auth database hooks for accounts. The app uses Google only to sign
 * people in and never calls a Google API, so it keeps none of the tokens
 * Google issues: they are dropped before the row is written, on the first
 * sign-in and on every later one. GitHub rows keep theirs, as before.
 */
export const accountHooks = {
  create: { before: (account: Account) => Promise.resolve({ data: withoutGoogleTokens(account) }) },
  update: { before: (account: Partial<Account> & Record<string, unknown>) => Promise.resolve({ data: withoutGoogleTokens(account) }) },
};
