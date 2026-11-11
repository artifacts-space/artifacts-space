/**
 * Google sign-in, as pure rules: when it is on, and which Google identities
 * may sign in. Better Auth reads them in `social-auth-options.ts`, and the
 * sign-in pages read `isGoogleSignInEnabled` to show or hide the button, so
 * the button and the server always agree.
 */

/** The environment values the Google decision reads. */
export interface GoogleSignInEnv {
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
  VERCEL_ENV?: string | undefined;
}

/** Google's OAuth client, ready for Better Auth. */
export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

/** `.env.example` and fresh Vercel variables start as `replace-with-…`. */
const placeholderPrefix = "replace-with-";

/** True when an environment value looks like a real credential: set, not blank, and not a `replace-with-…` placeholder. */
export function isRealCredential(value: string | undefined): value is string {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return !trimmed.toLowerCase().startsWith(placeholderPrefix);
}

/**
 * Google's client id and secret, or null when Google sign-in is off. It is
 * on only when both values are real, so a half-set deploy shows no button
 * that cannot work. Vercel previews are always off: Google accepts only the
 * exact redirect URIs registered on the client, never a wildcard, and each
 * preview has its own URL.
 */
export function googleCredentials(env: GoogleSignInEnv): GoogleCredentials | null {
  if (env.VERCEL_ENV === "preview") return null;
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = env;
  if (!isRealCredential(clientId) || !isRealCredential(clientSecret)) return null;
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
}

/**
 * True when the sign-in pages should offer "Continue with Google". The
 * pages are prerendered, so they read this when the deploy builds; Vercel
 * needs a new deploy for changed variables anyway, and the server reads the
 * same values.
 */
export function isGoogleSignInEnabled(env: GoogleSignInEnv): boolean {
  return googleCredentials(env) !== null;
}

/** Google's `email_verified` claim, read the way Better Auth reads it. Anything but true means unverified. */
export function isGoogleEmailVerified(profile: Record<string, unknown> | undefined): boolean {
  const claim = profile?.email_verified;
  return claim === true || claim === "true";
}

/** What Better Auth's `user.validateUserInfo` hook is told about an incoming identity. */
export interface IncomingIdentity {
  source: {
    method: string;
    oauth?: { providerId: string; profile?: Record<string, unknown> | undefined } | undefined;
  };
}

/** The refusal for a Google account whose email Google has not verified. */
export const unverifiedGoogleEmail = {
  error: "google_email_not_verified",
  errorDescription: "Google has not verified this email address. Sign in with an emailed link instead.",
} as const;

/**
 * Refuses a Google identity whose email Google has not verified, for every
 * step: creating an account, linking to an existing one, and signing in
 * again. An unverified address could belong to someone else, so it must
 * never create the account that its real owner later signs in to, nor join
 * an existing one. Other providers and methods pass through unchanged.
 */
export function googleIdentityProblem(identity: IncomingIdentity): typeof unverifiedGoogleEmail | undefined {
  const { oauth } = identity.source;
  if (identity.source.method !== "oauth" || oauth?.providerId !== "google") return undefined;
  return isGoogleEmailVerified(oauth.profile) ? undefined : unverifiedGoogleEmail;
}
