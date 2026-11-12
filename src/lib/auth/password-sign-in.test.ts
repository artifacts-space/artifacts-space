import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cookieHeader,
  createTestAuth,
  email,
  emptyTables,
  expectRefused,
  magicLinkSession,
  origin,
  passwordUser,
  post,
  signInWith,
  stubProviders,
  sentLinks,
  type Tables,
  type TestAuth,
} from "./social-auth-harness";

/*
 * Password sign-in on a real Better Auth instance with the app's options
 * (social-auth-harness.ts): an account the owner's script gave a password
 * signs in with it, every other answer is the same refusal, and no route or
 * server call can create an account with a password, add one, or change one.
 */

const password = "correct-horse-battery-staple-0123456789";

describe("password sign-in", () => {
  let tables: Tables;
  let auth: TestAuth;

  beforeEach(async () => {
    tables = emptyTables();
    auth = createTestAuth(tables);
    await passwordUser(tables, { password });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const credentialRows = () => tables.account.filter((row) => row.providerId === "credential");
  const storedHash = () => credentialRows()[0]?.password;
  const signIn = (body: Record<string, unknown>) => post(auth, "/sign-in/email", body);

  async function answer(response: Response) {
    return { status: response.status, body: await response.json() as unknown, cookies: response.headers.getSetCookie().length };
  }

  it("should sign in and set a session cookie when the password is right", async () => {
    const response = await signIn({ email, password, callbackURL: `${origin}/app` });

    expect(response.status).toBe(200);
    expect(cookieHeader(response)).toContain("session_token=");
    expect(tables.session).toEqual([expect.objectContaining({ userId: "password-user" })]);
  });

  it("should leave the session token out of the answer and keep it in the httpOnly cookie", async () => {
    const response = await signIn({ email, password });
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).not.toHaveProperty("token");
    expect(body).toMatchObject({ redirect: false, user: expect.objectContaining({ email }) as unknown });
    expect(JSON.stringify(body)).not.toContain(tables.session[0]?.token);
    expect(response.headers.getSetCookie().some((cookie) => cookie.includes("session_token=") && /HttpOnly/i.test(cookie))).toBe(true);
  });

  it("should accept the address in any case when the password is right", async () => {
    const response = await signIn({ email: "Sam@Example.COM", password });

    expect(response.status).toBe(200);
  });

  it("should give one refusal when the password is wrong, the email is unknown, or the account has no password", async () => {
    await magicLinkSession(auth, "linked@example.com");
    const sessionsBefore = tables.session.length;

    const answers = await Promise.all([
      signIn({ email, password: "wrong-password-0123456789abcdef" }),
      signIn({ email: "nobody@example.com", password }),
      signIn({ email: "linked@example.com", password }),
    ].map(async (response) => answer(await response)));

    expect(answers[0]).toEqual({ status: 401, body: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }, cookies: 0 });
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
    expect(tables.session).toHaveLength(sessionsBefore);
  });

  it("should refuse a password sign-in when the account's email is not confirmed", async () => {
    await passwordUser(tables, { password, address: "unconfirmed@example.com", userId: "unconfirmed" });
    const user = tables.user.find((row) => row.id === "unconfirmed");
    if (user) user.emailVerified = false;

    const response = await signIn({ email: "unconfirmed@example.com", password });

    expect(response.status).toBe(403);
    expect(tables.session).toEqual([]);
  });

  it.each([
    ["asks not to be remembered", { rememberMe: false }],
    ["sends an extra field", { oauth_query: "a=b" }],
    ["sends a password over 128 characters", { password: "x".repeat(129) }],
  ])("should refuse a sign-in that %s", async (_label, extra) => {
    const response = await signIn({ email, password, ...extra });

    expect(response.status).toBe(400);
    expect(tables.session).toEqual([]);
  });

  describe("sign-in links for an account with a password", () => {
    it("should send no link, silently, and answer exactly as for an address that gets one", async () => {
      const ask = (address: string) => post(auth, "/sign-in/magic-link", { email: address, callbackURL: `${origin}/app` });
      const sentBefore = sentLinks.length;

      const toPasswordAccount = await ask(email);
      expect(sentLinks.length).toBe(sentBefore);
      const toOtherAddress = await ask("someone-else@example.com");
      expect(sentLinks.length).toBe(sentBefore + 1);

      expect(toPasswordAccount.status).toBe(toOtherAddress.status);
      expect(await toPasswordAccount.text()).toBe(await toOtherAddress.text());
      expect(toPasswordAccount.headers.getSetCookie()).toEqual(toOtherAddress.headers.getSetCookie());
    });
  });

  describe("routes that would create or change a password", () => {
    it("should refuse to sign up with a password over HTTP and create nothing", async () => {
      const response = await post(auth, "/sign-up/email", { email: "new@example.com", password, name: "New" });

      expect(response.status).toBe(404);
      expect(tables.user.map((row) => row.email)).toEqual([email]);
      expect(credentialRows()).toHaveLength(1);
    });

    it("should refuse to sign up with a password when called on the server", async () => {
      await expect(auth.api.signUpEmail({ body: { email: "new@example.com", password, name: "New" } })).rejects.toMatchObject({ statusCode: 404 });

      expect(tables.user.map((row) => row.email)).toEqual([email]);
    });

    it.each([
      ["/request-password-reset", { email, redirectTo: `${origin}/reset` }],
      ["/reset-password", { token: "made-up", newPassword: "a-new-password-0123456789abcdef" }],
      ["/change-password", { currentPassword: password, newPassword: "a-new-password-0123456789abcdef" }],
      ["/set-password", { newPassword: "a-new-password-0123456789abcdef" }],
      ["/verify-password", { password }],
    ])("should answer not found at %s, even for the signed-in password account", async (path, body) => {
      const hashBefore = storedHash();
      const cookie = cookieHeader(await signIn({ email, password }));

      const response = await post(auth, path, body, cookie);

      expect(response.status).toBe(404);
      expect(storedHash()).toBe(hashBefore);
    });

    it("should answer not found when a reset link is opened", async () => {
      const response = await auth.handler(new Request(`${origin}/api/auth/reset-password/made-up?callbackURL=${encodeURIComponent(`${origin}/app`)}`));

      expect(response.status).toBe(404);
    });

    it("should refuse to change the password when called on the server", async () => {
      const hashBefore = storedHash();
      const headers = new Headers({ cookie: cookieHeader(await signIn({ email, password })) });

      await expect(auth.api.changePassword({ body: { currentPassword: password, newPassword: "a-new-password-0123456789abcdef" }, headers })).rejects.toMatchObject({ statusCode: 404 });

      expect(storedHash()).toBe(hashBefore);
    });

    it("should refuse to add a password to an account without one when called on the server", async () => {
      const { cookie } = await magicLinkSession(auth, "linked@example.com");

      // A server-only endpoint has no route path for the guard to match; the account write guard refuses it.
      await expect(auth.api.setPassword({ body: { newPassword: "a-new-password-0123456789abcdef" }, headers: new Headers({ cookie }) })).rejects.toMatchObject({ statusCode: 403 });

      expect(credentialRows()).toHaveLength(1);
    });

    it("should refuse to write a password login when Better Auth's adapter is asked to", async () => {
      const context = await auth.$context;

      await expect(context.internalAdapter.createAccount({ userId: "password-user", providerId: "credential", accountId: "other", password: "plain" })).rejects.toMatchObject({ statusCode: 403 });
      await expect(context.internalAdapter.updateAccount("password-user-credential", { password: "plain" })).rejects.toMatchObject({ statusCode: 403 });

      expect(credentialRows()).toHaveLength(1);
    });
  });

  describe("GitHub and Google with a password account's email", () => {
    it.each([
      ["GitHub, with the address verified", "github" as const, { github: { id: 9001, verified: true } }],
      ["Google, hosting the address", "google" as const, { google: { sub: "g-reviewer", email_verified: true, hd: "example.com" } }],
    ])("should refuse to sign into the password account with %s", async (_label, provider, identity) => {
      stubProviders(identity);

      const location = await signInWith(auth, provider);

      expectRefused(location, ["password_account_not_linkable"]);
      expect(tables.account.map((row) => row.providerId)).toEqual(["credential"]);
      expect(tables.session).toEqual([]);
    });

    it("should refuse to link GitHub to the password account from a signed-in session", async () => {
      stubProviders({ github: { id: 9002, verified: true } });
      const cookie = cookieHeader(await signIn({ email, password }));

      const location = await signInWith(auth, "github", { path: "/link-social", cookie });

      expectRefused(location, ["password_account_not_linkable"]);
      expect(tables.account.map((row) => row.providerId)).toEqual(["credential"]);
    });
  });
});
