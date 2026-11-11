import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTestAuth,
  emptyTables,
  existingUser,
  expectRefused,
  invitationPath,
  magicLinkSession,
  origin,
  post,
  signedIdToken,
  signInWith,
  stubProviders,
  type Tables,
  type TestAuth,
} from "./social-auth-harness";

/*
 * The edges of GitHub and Google sign-in on a real Better Auth instance with
 * the app's options (social-auth-harness.ts): only the browser flow signs
 * in, the server decides what Google is asked for, redirects stay on this
 * site, linking a signed-in account follows the same rules, and Google's
 * tokens are never kept.
 */

describe("social sign-in hardening", () => {
  let tables: Tables;
  let auth: TestAuth;

  beforeEach(() => {
    tables = emptyTables();
    auth = createTestAuth(tables);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const googleAccounts = () => tables.account.filter((row) => row.providerId === "google");

  describe("ID token sign-in", () => {
    it("should refuse a bare Google ID token when it is posted to sign in, even a validly signed one", async () => {
      stubProviders({});
      const token = signedIdToken({ sub: "g-id", email: "new@gmail.com", email_verified: true });

      const response = await post(auth, "/sign-in/social", { provider: "google", idToken: { token } });

      // Better Auth answers a provider with ID token sign-in turned off as "not found".
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "ID_TOKEN_NOT_SUPPORTED" });
      expect(tables.user).toEqual([]);
      expect(tables.session).toEqual([]);
    });

    it("should refuse a bare Google ID token when it is posted to link a signed-in account", async () => {
      stubProviders({});
      const { cookie } = await magicLinkSession(auth, "sam@gmail.com");
      const token = signedIdToken({ sub: "g-id", email: "sam@gmail.com", email_verified: true });

      const response = await post(auth, "/link-social", { provider: "google", idToken: { token } }, cookie);

      // Better Auth answers a provider with ID token sign-in turned off as "not found".
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "ID_TOKEN_NOT_SUPPORTED" });
      expect(googleAccounts()).toEqual([]);
    });
  });

  describe("what Google is asked for", () => {
    it.each([
      ["/sign-in/social", { scopes: ["https://www.googleapis.com/auth/drive"] }],
      ["/sign-in/social", { additionalParams: { access_type: "offline" } }],
      ["/link-social", { scopes: ["https://www.googleapis.com/auth/gmail.readonly"] }],
    ] as const)("should refuse %s when the request sets %j", async (path, extra) => {
      stubProviders({});
      const { cookie } = await magicLinkSession(auth);

      const response = await post(auth, path, { provider: "google", callbackURL: `${origin}/app`, ...extra }, cookie);

      expect(response.status).toBe(400);
    });

    it("should ask Google for openid, email, and profile only, with no earlier grants and a fresh account choice", async () => {
      stubProviders({});

      const response = await post(auth, "/sign-in/social", { provider: "google", callbackURL: `${origin}/app` });
      const { url } = (await response.json()) as { url: string };
      const params = new URL(url).searchParams;

      expect(params.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
      expect(params.get("include_granted_scopes")).toBeNull();
      expect(params.get("access_type")).toBeNull();
      expect(params.get("prompt")).toBe("select_account");
      expect(params.get("redirect_uri")).toBe(`${origin}/api/auth/callback/google`);
    });
  });

  describe("redirects", () => {
    it.each(["callbackURL", "errorCallbackURL"])("should refuse to start Google sign-in when %s points to another site", async (field) => {
      stubProviders({});

      const response = await post(auth, "/sign-in/social", { provider: "google", callbackURL: `${origin}/app`, [field]: "https://evil.example/steal" });

      expect(response.status).toBe(403);
    });
  });

  describe("linking a signed-in account", () => {
    it("should link Google to the signed-in account when Google hosts the same address", async () => {
      stubProviders({ google: { sub: "g-link", email: "sam@gmail.com", email_verified: true } });
      const { cookie } = await magicLinkSession(auth, "sam@gmail.com");

      await signInWith(auth, "google", { path: "/link-social", cookie });

      expect(googleAccounts()).toEqual([expect.objectContaining({ accountId: "g-link" })]);
    });

    it.each([
      ["a different verified address", { sub: "g-other", email: "other@gmail.com", email_verified: true }, "email_does_not_match"],
      ["an unverified address", { sub: "g-unverified", email: "sam@gmail.com", email_verified: false }, "google_email_not_verified"],
    ])("should refuse to link Google when it reports %s", async (_label, google, code) => {
      stubProviders({ google });
      const { cookie } = await magicLinkSession(auth, "sam@gmail.com");

      const location = await signInWith(auth, "google", { path: "/link-social", cookie });

      expectRefused(location, [code]);
      expect(googleAccounts()).toEqual([]);
    });

    it("should refuse to link Google when Google does not host the address", async () => {
      stubProviders({ google: { sub: "g-outside", email_verified: true } });
      const { cookie } = await magicLinkSession(auth);

      const location = await signInWith(auth, "google", { path: "/link-social", cookie });

      expectRefused(location, ["google_email_not_authoritative"]);
      expect(googleAccounts()).toEqual([]);
    });
  });

  describe("stored tokens", () => {
    const tokens = (row: Record<string, unknown> | undefined) => [row?.accessToken, row?.refreshToken, row?.idToken];

    it("should keep none of Google's tokens when a person signs up and again when they sign back in", async () => {
      stubProviders({ google: { sub: "g-tokens", email_verified: true, hd: "example.com" } });

      expect(await signInWith(auth, "google")).toBe(`${origin}${invitationPath}`);
      expect(tokens(googleAccounts()[0]).filter(Boolean)).toEqual([]);

      expect(await signInWith(auth, "google")).toBe(`${origin}${invitationPath}`);
      expect(googleAccounts()).toHaveLength(1);
      expect(tokens(googleAccounts()[0]).filter(Boolean)).toEqual([]);
      expect(tables.session).toHaveLength(2);
    });

    it("should keep none of Google's tokens when Google joins an existing account", async () => {
      existingUser(tables, { verified: true });
      stubProviders({ google: { sub: "g-join", email_verified: true, hd: "example.com" } });

      await signInWith(auth, "google");

      expect(googleAccounts()).toHaveLength(1);
      expect(tokens(googleAccounts()[0]).filter(Boolean)).toEqual([]);
    });

    it("should keep GitHub's access token as before when a person signs in with GitHub", async () => {
      stubProviders({ github: { id: 4242, verified: true } });

      await signInWith(auth, "github");

      expect(tables.account.find((row) => row.providerId === "github")?.accessToken).toBe("github-access");
    });
  });

  it("should send a refused sign-in back to the page it started on", async () => {
    stubProviders({ google: { sub: "g-outside", email_verified: true } });

    expectRefused(await signInWith(auth, "google"), ["google_email_not_authoritative"]);
  });
});
