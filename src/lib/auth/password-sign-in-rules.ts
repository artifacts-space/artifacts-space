import { z } from "zod";

/**
 * Password sign-in, for accounts an owner gave a password with
 * scripts/create-reviewer-account.mts (connector directory reviewers). Only
 * signing in exists: nobody can sign up with a password, add one to an
 * account, or set, change, or reset one over the web or the API. These are
 * the pure rules; password-sign-in-options.ts applies them to Better Auth.
 */

/** Better Auth's provider id for an email-and-password login. Its `accountId` is the user's id. */
export const credentialProviderId = "credential";

/** The one password route that stays open. */
export const passwordSignInPath = "/sign-in/email";

/**
 * Every Better Auth 1.7 route that creates an account with a password, sets,
 * changes, or resets one, or checks one for a signed-in person. Closed over
 * HTTP (`disabledPaths`, which matches the raw URL) and again on the route
 * Better Auth resolved (passwordSignInGuard), for HTTP and in-process calls
 * alike. `/set-password` is server-only in Better Auth and has no route
 * path, so the account write guard (passwordWriteProblem) is what refuses
 * it; it is listed in case a later version routes it.
 */
export const passwordRoutesClosed = [
  "/sign-up/email",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
  "/change-password",
  "/set-password",
  "/verify-password",
] as const;

const closedPaths: ReadonlySet<string> = new Set(passwordRoutesClosed);

/** True when a resolved Better Auth route path is one of the closed password routes. */
export function isClosedPasswordRoute(path: string | undefined): boolean {
  if (!path) return false;
  return closedPaths.has(path) || path.startsWith("/reset-password/");
}

/** The raw paths for `disabledPaths`. A path with a parameter cannot match there, so the guard covers it. */
export const passwordPathsDisabledOverHttp: string[] = passwordRoutesClosed.filter((path) => !path.includes(":"));

/**
 * What a password sign-in may send: an email, a password, and where to go
 * next. Nothing else: no "don't remember me" (sessions always last the same
 * 30 days, session-config.ts) and no extra fields.
 */
export const passwordSignInBodySchema = z.strictObject({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(128),
  callbackURL: z.string().max(2048).optional(),
});

/** True when the body is a sign-in request the guard lets through to Better Auth. */
export function isAllowedPasswordSignInBody(body: unknown): boolean {
  return passwordSignInBodySchema.safeParse(body).success;
}

/**
 * Better Auth's `emailAndPassword` options. Sign-in only: sign-up is off,
 * and no reset email is configured, so nothing can send a reset link. An
 * account whose email is not confirmed cannot sign in with a password.
 * Passwords are hashed with Better Auth's own scrypt hasher.
 */
export const emailAndPasswordOptions = {
  enabled: true,
  disableSignUp: true,
  requireEmailVerification: true,
  minPasswordLength: 24,
  maxPasswordLength: 128,
};

/** What an account write looks like to the guard. */
interface AccountWrite {
  providerId?: unknown;
  password?: unknown;
}

/**
 * Why Better Auth must not write this account row, or null when it may. Only
 * the owner's script gives an account a password, writing to the database
 * directly; Better Auth itself never creates a password login or writes a
 * password, whatever route or call asks it to.
 */
export function passwordWriteProblem(account: AccountWrite): string | null {
  if (account.providerId === credentialProviderId) return "Password logins are created only by the owner's script.";
  if (account.password !== undefined && account.password !== null) return "Passwords are set only by the owner's script.";
  return null;
}

/** The refusal for a GitHub or Google login that would join an account that has a password. */
export const passwordAccountNotLinkable = {
  error: "password_account_not_linkable",
  errorDescription: "This account signs in with a password only.",
} as const;

/** True when one of these account rows is a password login. */
export function hasPasswordLogin(accounts: readonly { providerId: string }[]): boolean {
  return accounts.some((account) => account.providerId === credentialProviderId);
}
