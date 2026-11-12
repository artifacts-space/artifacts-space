import { generateKeyPairSync, sign } from "node:crypto";

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { hashPassword } from "better-auth/crypto";
import { magicLink } from "better-auth/plugins";
import { expect, vi } from "vitest";

import { passwordSignInGuard } from "./password-sign-in-options";
import { credentialProviderId, emailAndPasswordOptions, passwordPathsDisabledOverHttp } from "./password-sign-in-rules";
import { accountHooks, accountLinking, socialProviders, socialSignInGuard, validateUserInfo } from "./social-auth-options";

/*
 * Test harness only (imported by *.test.ts, never by the app): a real Better
 * Auth instance with the app's social sign-in options, in memory. Only the
 * boundaries are swapped: the memory adapter stands in for Postgres, and
 * `fetch` answers for Google's and GitHub's endpoints, so no request leaves
 * the test.
 */

export const origin = "https://artifacts.space";
export const email = "sam@example.com";

export const env = {
  GOOGLE_CLIENT_ID: "test-google-client.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
  GITHUB_CLIENT_ID: "test-github-client",
  GITHUB_CLIENT_SECRET: "test-github-secret",
};

interface Row extends Record<string, unknown> {
  id: string;
}

export interface Tables {
  [table: string]: Row[];
  user: (Row & { email: string; emailVerified: boolean })[];
  session: (Row & { userId: string })[];
  account: (Row & { userId: string; providerId: string; accountId: string })[];
  verification: Row[];
}

/** Empty tables for one test. */
export function emptyTables(): Tables {
  return { user: [], session: [], account: [], verification: [] };
}

/** Every magic link the test instances "emailed", newest last. */
const sentLinks: string[] = [];

/** Better Auth with the same social and password options as src/lib/auth/server.ts. */
export function createTestAuth(tables: Tables) {
  return betterAuth({
    baseURL: origin,
    secret: "social-linking-test-secret-0123456789abcdef",
    database: memoryAdapter(tables),
    emailAndPassword: emailAndPasswordOptions,
    socialProviders: socialProviders(env),
    account: { accountLinking },
    user: { validateUserInfo },
    databaseHooks: { account: accountHooks },
    disabledPaths: passwordPathsDisabledOverHttp,
    plugins: [magicLink({ sendMagicLink: ({ url }) => { sentLinks.push(url); } }), socialSignInGuard(), passwordSignInGuard()],
    // Vitest runs count as tests, where Better Auth skips its callbackURL check unless told otherwise.
    advanced: { disableOriginCheck: false },
  });
}

export type TestAuth = ReturnType<typeof createTestAuth>;

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** Google's ID token claims for one person. `email` defaults to the shared test address. */
export interface GoogleClaims {
  sub: string;
  email_verified: boolean;
  email?: string;
  hd?: string;
}

function googlePayload(claims: GoogleClaims) {
  return { iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, iat: Math.floor(Date.now() / 1000), exp: 4_102_444_800, name: "Sam", email, ...claims };
}

/** An ID token as Google's token endpoint returns it. The code callback only decodes it, so it needs no real signature. */
function unsignedIdToken(claims: GoogleClaims) {
  return `${base64url({ alg: "RS256", typ: "JWT", kid: "test" })}.${base64url(googlePayload(claims))}.signature`;
}

/** A key pair standing in for Google's signing key, for ID tokens that must verify. */
const googleKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const googleKeyId = "test-key";

/** An ID token signed with the stand-in Google key, which the stubbed certs endpoint publishes. */
export function signedIdToken(claims: GoogleClaims) {
  const signingInput = `${base64url({ alg: "RS256", typ: "JWT", kid: googleKeyId })}.${base64url(googlePayload(claims))}`;
  return `${signingInput}.${sign("RSA-SHA256", Buffer.from(signingInput), googleKey.privateKey).toString("base64url")}`;
}

/** Who the providers say signed in. */
export interface Identity {
  google?: GoogleClaims;
  github?: { id: number; verified: boolean };
}

/** Answers the providers' endpoints for one identity, and fails the test on any other request. */
export function stubProviders(identity: Identity) {
  const routes: Record<string, () => unknown> = {
    "https://oauth2.googleapis.com/token": () => {
      if (!identity.google) throw new Error("No Google identity in this test.");
      return { access_token: "google-access", token_type: "Bearer", expires_in: 3600, id_token: unsignedIdToken(identity.google) };
    },
    "https://www.googleapis.com/oauth2/v3/certs": () => ({ keys: [{ ...googleKey.publicKey.export({ format: "jwk" }), kid: googleKeyId, alg: "RS256", use: "sig" }] }),
    "https://github.com/login/oauth/access_token": () => ({ access_token: "github-access", token_type: "bearer", scope: "read:user,user:email" }),
    "https://api.github.com/user": () => ({ id: identity.github?.id, login: "sam", name: "Sam", email, avatar_url: null }),
    "https://api.github.com/user/emails": () => [{ email, primary: true, verified: identity.github?.verified ?? false }],
  };
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = (input instanceof Request ? input.url : String(input)).split("?")[0] ?? "";
    const route = Object.hasOwn(routes, url) ? routes[url] : undefined;
    if (!route) return Promise.reject(new Error(`Unexpected request to ${url}`));
    return Promise.resolve(Response.json(route()));
  });
}

/** POSTs JSON to a Better Auth route as this site's own page would. */
export function post(auth: TestAuth, path: string, body: Record<string, unknown>, cookie = "") {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((value) => value.split(";")[0] ?? "");

/** The page each test sign-in starts from: an invitation, so redirects carry a `next`. */
export const invitationPath = "/invitations/inv-1";

/** Where a failed sign-in comes back to, as the sign-in form sets it. */
const errorReturn = `${origin}/sign-in?${new URLSearchParams({ next: invitationPath }).toString()}`;

/** Checks that a sign-in went back to the page it started on, refused with one of `codes`. Failures name the location. */
export function expectRefused(location: string, codes: string[]) {
  expect(location, "a refused sign-in redirects").not.toBe("");
  const url = new URL(location);
  expect(`${url.origin}${url.pathname}`, location).toBe(`${origin}/sign-in`);
  expect(url.searchParams.get("next"), location).toBe(invitationPath);
  const error = url.searchParams.get("error");
  expect(error, location).not.toBeNull();
  expect(codes, location).toContain(error);
}

/**
 * Starts a sign-in (or, with a session cookie, a link) like the button does,
 * then comes back through the callback like the provider would. Returns
 * where the browser is sent.
 */
export async function signInWith(auth: TestAuth, provider: "google" | "github", options: { path?: "/sign-in/social" | "/link-social"; cookie?: string } = {}) {
  const { path = "/sign-in/social", cookie = "" } = options;
  const started = await post(auth, path, { provider, callbackURL: `${origin}${invitationPath}`, errorCallbackURL: errorReturn }, cookie);
  const { url } = (await started.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") ?? "";
  const cookies = [cookie, ...cookiesFrom(started)].filter(Boolean).join("; ");
  const callback = await auth.handler(new Request(`${origin}/api/auth/callback/${provider}?code=test-code&state=${encodeURIComponent(state)}`, { headers: { cookie: cookies } }));
  return callback.headers.get("location") ?? "";
}

/** Signs `address` in with a magic link (creating the account if needed) and returns the session cookie. */
export async function magicLinkSession(auth: TestAuth, address = email) {
  await post(auth, "/sign-in/magic-link", { email: address, callbackURL: `${origin}/app` });
  const link = sentLinks.at(-1);
  if (!link) throw new Error("No magic link was sent.");
  const response = await auth.handler(new Request(link));
  return { location: response.headers.get("location") ?? "", cookie: cookiesFrom(response).join("; ") };
}

/** An existing account for `email`: confirmed (a magic link or a verified GitHub email) or not, with or without a GitHub login. */
export function existingUser(tables: Tables, { verified, github = false, address = email }: { verified: boolean; github?: boolean; address?: string }) {
  const now = new Date();
  const userId = "existing-user";
  tables.user.push({ id: userId, email: address, emailVerified: verified, name: "Sam", image: null, createdAt: now, updatedAt: now });
  if (github) tables.account.push({ id: "existing-github", userId, providerId: "github", accountId: "4242", accessToken: "github-old", createdAt: now, updatedAt: now });
  return userId;
}

/**
 * An account the owner's script gave a password, as the script writes it:
 * a confirmed user and a credential login whose account id is the user's id,
 * with the password hashed by Better Auth's own hasher.
 */
export async function passwordUser(tables: Tables, { password, address = email, userId = "password-user" }: { password: string; address?: string; userId?: string }) {
  const now = new Date();
  tables.user.push({ id: userId, email: address, emailVerified: true, name: "Reviewer", image: null, createdAt: now, updatedAt: now });
  tables.account.push({ id: `${userId}-credential`, userId, providerId: credentialProviderId, accountId: userId, password: await hashPassword(password), createdAt: now, updatedAt: now });
  return userId;
}

/** Cookies a response set, as one Cookie header. */
export function cookieHeader(response: Response) {
  return cookiesFrom(response).join("; ");
}
