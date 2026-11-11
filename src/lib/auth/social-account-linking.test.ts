import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { magicLink } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accountLinking, socialProviders, validateUserInfo } from "./social-auth-options";

/*
 * The whole Google and GitHub sign-in round trip through a real Better Auth
 * instance with the app's provider, linking, and validation options, in
 * memory. Only the boundaries are swapped: the memory adapter stands in for
 * Postgres, and `fetch` answers for Google's and GitHub's token and profile
 * endpoints, so no request leaves the test. These tests fail if an
 * unverified Google email could ever create, join, or take over an account.
 */

const origin = "https://artifacts.space";
const email = "sam@example.com";

const env = {
  GOOGLE_CLIENT_ID: "test-google-client.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
  GITHUB_CLIENT_ID: "test-github-client",
  GITHUB_CLIENT_SECRET: "test-github-secret",
};

interface Row extends Record<string, unknown> {
  id: string;
}

interface Tables {
  [table: string]: Row[];
  user: (Row & { email: string; emailVerified: boolean })[];
  session: (Row & { userId: string })[];
  account: (Row & { userId: string; providerId: string; accountId: string })[];
  verification: Row[];
}

/** The newest magic link each test's auth instance "emailed". */
const sentLinks: string[] = [];

function createTestAuth(tables: Tables) {
  return betterAuth({
    baseURL: origin,
    secret: "social-linking-test-secret-0123456789abcdef",
    database: memoryAdapter(tables),
    emailAndPassword: { enabled: false },
    socialProviders: socialProviders(env),
    account: { accountLinking },
    user: { validateUserInfo },
    plugins: [magicLink({ sendMagicLink: ({ url }) => { sentLinks.push(url); } })],
    // Vitest runs count as tests, where Better Auth skips its callbackURL check unless told otherwise.
    advanced: { disableOriginCheck: false },
  });
}

type TestAuth = ReturnType<typeof createTestAuth>;

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** An id token as Google's token endpoint returns it. The callback only decodes it, so it needs no signature here. */
function googleIdToken(claims: { sub: string; email: string; email_verified: boolean }) {
  const payload = { iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, iat: 1, exp: 4_102_444_800, name: "Sam", ...claims };
  return `${base64url({ alg: "RS256", typ: "JWT", kid: "test" })}.${base64url(payload)}.signature`;
}

interface Identity {
  google?: { sub: string; email_verified: boolean };
  github?: { id: number; verified: boolean };
}

/** Answers the providers' endpoints for one identity, and fails the test on any other request. */
function stubProviders(identity: Identity) {
  const routes: Record<string, () => unknown> = {
    "https://oauth2.googleapis.com/token": () => {
      if (!identity.google) throw new Error("No Google identity in this test.");
      return { access_token: "google-access", token_type: "Bearer", expires_in: 3600, id_token: googleIdToken({ ...identity.google, email }) };
    },
    "https://github.com/login/oauth/access_token": () => ({ access_token: "github-access", token_type: "bearer", scope: "read:user,user:email" }),
    "https://api.github.com/user": () => ({ id: identity.github?.id, login: "sam", name: "Sam", email, avatar_url: null }),
    "https://api.github.com/user/emails": () => [{ email, primary: true, verified: identity.github?.verified ?? false }],
  };
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = (input instanceof Request ? input.url : String(input)).split("?")[0] ?? "";
    const route = routes[url];
    if (!route) return Promise.reject(new Error(`Unexpected request to ${url}`));
    return Promise.resolve(Response.json(route()));
  });
}

/** Starts sign-in like the button does, then comes back through the callback like the provider would. Returns where the browser is sent. */
async function signInWith(auth: TestAuth, provider: "google" | "github") {
  const started = await auth.handler(
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ provider, callbackURL: `${origin}/invitations/inv-1`, errorCallbackURL: `${origin}/sign-in?next=%2Finvitations%2Finv-1` }),
    }),
  );
  const { url } = (await started.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") ?? "";
  const cookie = started.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const callback = await auth.handler(new Request(`${origin}/api/auth/callback/${provider}?code=test-code&state=${encodeURIComponent(state)}`, { headers: { cookie } }));
  return callback.headers.get("location") ?? "";
}

describe("social sign-in account linking", () => {
  let tables: Tables;
  let auth: TestAuth;

  beforeEach(() => {
    tables = { user: [], session: [], account: [], verification: [] };
    auth = createTestAuth(tables);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** An existing account for `email`: confirmed (a magic link or a verified GitHub email) or not, with or without a GitHub login. */
  function existingUser({ verified, github = false }: { verified: boolean; github?: boolean }) {
    const now = new Date();
    const userId = "existing-user";
    tables.user.push({ id: userId, email, emailVerified: verified, name: "Sam", image: null, createdAt: now, updatedAt: now });
    if (github) tables.account.push({ id: "existing-github", userId, providerId: "github", accountId: "4242", createdAt: now, updatedAt: now });
    return userId;
  }

  const googleAccounts = () => tables.account.filter((row) => row.providerId === "google");

  it("should land a verified Google email in the matching magic-link account when that email is confirmed", async () => {
    const userId = existingUser({ verified: true });
    stubProviders({ google: { sub: "g-1", email_verified: true } });

    const location = await signInWith(auth, "google");

    expect(location).toBe(`${origin}/invitations/inv-1`);
    expect(tables.user).toHaveLength(1);
    expect(googleAccounts()).toEqual([expect.objectContaining({ userId, accountId: "g-1" })]);
    expect(tables.session.map((row) => row.userId)).toEqual([userId]);
  });

  it("should land a verified Google email in the matching GitHub account when that email is confirmed", async () => {
    const userId = existingUser({ verified: true, github: true });
    stubProviders({ google: { sub: "g-1", email_verified: true } });

    await signInWith(auth, "google");

    expect(tables.user).toHaveLength(1);
    expect(googleAccounts()).toEqual([expect.objectContaining({ userId })]);
  });

  it("should never link an unverified Google email to an existing account", async () => {
    existingUser({ verified: true, github: true });
    stubProviders({ google: { sub: "g-attacker", email_verified: false } });

    const location = await signInWith(auth, "google");

    // Better Auth's own linking rule refuses first; the Google gate would refuse it too.
    expect(location).toMatch(/^https:\/\/artifacts\.space\/sign-in\?next=%2Finvitations%2Finv-1&error=(account_not_linked|google_email_not_verified)(&|$)/);
    expect(googleAccounts()).toEqual([]);
    expect(tables.user).toHaveLength(1);
    expect(tables.session).toEqual([]);
  });

  it("should never create an account from an unverified Google email, so its real owner cannot sign in to it later", async () => {
    stubProviders({ google: { sub: "g-attacker", email_verified: false } });

    const location = await signInWith(auth, "google");

    expect(location).toMatch(/^https:\/\/artifacts\.space\/sign-in\?next=%2Finvitations%2Finv-1&error=google_email_not_verified(&|$)/);
    expect(tables.user).toEqual([]);
    expect(googleAccounts()).toEqual([]);
    expect(tables.session).toEqual([]);
  });

  it("should not link a verified Google email when the existing account never confirmed that email", async () => {
    existingUser({ verified: false, github: true });
    stubProviders({ google: { sub: "g-1", email_verified: true } });

    const location = await signInWith(auth, "google");

    expect(location).toMatch(/^https:\/\/artifacts\.space\/sign-in\?next=%2Finvitations%2Finv-1&error=account_not_linked(&|$)/);
    expect(googleAccounts()).toEqual([]);
    expect(tables.session).toEqual([]);
  });

  it("should create a confirmed account when a new person signs in with a verified Google email", async () => {
    stubProviders({ google: { sub: "g-new", email_verified: true } });

    const location = await signInWith(auth, "google");

    expect(location).toBe(`${origin}/invitations/inv-1`);
    expect(tables.user).toEqual([expect.objectContaining({ email, emailVerified: true })]);
    expect(googleAccounts()).toHaveLength(1);
  });

  it("should still link a GitHub sign-in to the matching confirmed account when GitHub verified the email", async () => {
    const userId = existingUser({ verified: true });
    stubProviders({ github: { id: 4242, verified: true } });

    await signInWith(auth, "github");

    expect(tables.account).toEqual([expect.objectContaining({ userId, providerId: "github", accountId: "4242" })]);
    expect(tables.user).toHaveLength(1);
  });

  it("should still refuse to link a GitHub sign-in when GitHub has not verified the email", async () => {
    existingUser({ verified: true });
    stubProviders({ github: { id: 4242, verified: false } });

    const location = await signInWith(auth, "github");

    expect(location).toMatch(/^https:\/\/artifacts\.space\/sign-in\?next=%2Finvitations%2Finv-1&error=account_not_linked(&|$)/);
    expect(tables.account).toEqual([]);
  });

  it("should still create an account from a magic link when the Google gate is on", async () => {
    stubProviders({});
    await auth.handler(
      new Request(`${origin}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ email, callbackURL: `${origin}/app` }),
      }),
    );
    const link = sentLinks.at(-1);
    if (!link) throw new Error("No magic link was sent.");

    const response = await auth.handler(new Request(link));

    expect(response.headers.get("location")).toBe(`${origin}/app`);
    expect(tables.user).toEqual([expect.objectContaining({ email, emailVerified: true })]);
  });

  it("should refuse to start Google sign-in when the destination is another site", async () => {
    stubProviders({});
    const response = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ provider: "google", callbackURL: "https://evil.example/steal" }),
      }),
    );

    expect(response.status).toBe(403);
  });
});

describe("social auth options", () => {
  it("should trust no provider to link on an email it did not verify", () => {
    expect(accountLinking.trustedProviders).toEqual([]);
    expect(accountLinking.allowDifferentEmails).toBe(false);
  });

  it("should configure Google only when both values are real", () => {
    expect(Object.keys(socialProviders(env))).toEqual(["github", "google"]);
    expect(Object.keys(socialProviders({ ...env, GOOGLE_CLIENT_ID: "replace-with-google-client-id" }))).toEqual(["github"]);
    expect(Object.keys(socialProviders({ ...env, VERCEL_ENV: "preview" }))).toEqual(["github"]);
  });
});
