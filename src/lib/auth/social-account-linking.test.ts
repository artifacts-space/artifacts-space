import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accountLinking, socialProviders } from "./social-auth-options";
import { createTestAuth, emptyTables, env, errorReturn, existingUser, magicLinkSession, origin, signInWith, stubProviders, type Tables, type TestAuth } from "./social-auth-harness";

/*
 * Account linking through the whole Google and GitHub round trip, on a real
 * Better Auth instance with the app's options (social-auth-harness.ts).
 * These tests fail if a Google identity could create, join, or take over an
 * account for an address it does not control: unverified, or verified by
 * Google for a mailbox Google does not host.
 */

/** A Google Workspace account on example.com, whose address Google vouches for. */
const workspace = (sub: string) => ({ sub, email_verified: true, hd: "example.com" });
/** A consumer Google account registered with an outside address: verified once, not hosted by Google. */
const outsideAddress = (sub: string) => ({ sub, email_verified: true });

const refusedWith = (codes: string) => new RegExp(`^${errorReturn.replace(/[.?]/g, "\\$&")}&error=(${codes})(&|$)`);

describe("social sign-in account linking", () => {
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

  it("should land a verified Workspace Google email in the matching magic-link account when that email is confirmed", async () => {
    const userId = existingUser(tables, { verified: true });
    stubProviders({ google: workspace("g-1") });

    const location = await signInWith(auth, "google");

    expect(location).toBe(`${origin}/invitations/inv-1`);
    expect(tables.user).toHaveLength(1);
    expect(googleAccounts()).toEqual([expect.objectContaining({ userId, accountId: "g-1" })]);
    expect(tables.session.map((row) => row.userId)).toEqual([userId]);
  });

  it("should land a verified Workspace Google email in the matching GitHub account when that email is confirmed", async () => {
    const userId = existingUser(tables, { verified: true, github: true });
    stubProviders({ google: workspace("g-1") });

    await signInWith(auth, "google");

    expect(tables.user).toHaveLength(1);
    expect(googleAccounts()).toEqual([expect.objectContaining({ userId })]);
  });

  it("should land a Gmail sign-in in the matching account when only the letter case differs", async () => {
    const userId = existingUser(tables, { verified: true, address: "sam@gmail.com" });
    stubProviders({ google: { sub: "g-case", email: "Sam@Gmail.com", email_verified: true } });

    await signInWith(auth, "google");

    expect(googleAccounts()).toEqual([expect.objectContaining({ userId })]);
    expect(tables.user).toHaveLength(1);
  });

  it("should not join an account when only Gmail's ignored dots differ", async () => {
    const userId = existingUser(tables, { verified: true, address: "firstlast@gmail.com" });
    stubProviders({ google: { sub: "g-dots", email: "first.last@gmail.com", email_verified: true } });

    await signInWith(auth, "google");

    expect(googleAccounts().map((row) => row.userId)).not.toContain(userId);
    expect(tables.user.map((row) => row.email).sort()).toEqual(["first.last@gmail.com", "firstlast@gmail.com"]);
  });

  it("should never link an unverified Google email to an existing account", async () => {
    existingUser(tables, { verified: true, github: true });
    stubProviders({ google: { sub: "g-attacker", email_verified: false, hd: "example.com" } });

    const location = await signInWith(auth, "google");

    // Better Auth's own linking rule refuses first; the Google gate would refuse it too.
    expect(location).toMatch(refusedWith("account_not_linked|google_email_not_verified"));
    expect(googleAccounts()).toEqual([]);
    expect(tables.user).toHaveLength(1);
    expect(tables.session).toEqual([]);
  });

  it("should never create an account from an unverified Google email, so its real owner cannot sign in to it later", async () => {
    stubProviders({ google: { sub: "g-attacker", email_verified: false, hd: "example.com" } });

    const location = await signInWith(auth, "google");

    expect(location).toMatch(refusedWith("google_email_not_verified"));
    expect(tables.user).toEqual([]);
    expect(googleAccounts()).toEqual([]);
    expect(tables.session).toEqual([]);
  });

  it("should never link a verified Google email that Google does not host, even when the account confirmed it", async () => {
    existingUser(tables, { verified: true });
    stubProviders({ google: outsideAddress("g-former-employee") });

    const location = await signInWith(auth, "google");

    // Better Auth's own rule lets this through (verified on both sides), so only the Google gate stops it.
    expect(location).toMatch(refusedWith("google_email_not_authoritative"));
    expect(googleAccounts()).toEqual([]);
    expect(tables.session).toEqual([]);
  });

  it("should never create an account from a verified Google email that Google does not host", async () => {
    stubProviders({ google: outsideAddress("g-outside") });

    const location = await signInWith(auth, "google");

    expect(location).toMatch(refusedWith("google_email_not_authoritative"));
    expect(tables.user).toEqual([]);
    expect(tables.session).toEqual([]);
  });

  it("should keep signing in a Google account that is already linked when its address is outside Google", async () => {
    const userId = existingUser(tables, { verified: true });
    const now = new Date();
    tables.account.push({ id: "linked-google", userId, providerId: "google", accountId: "g-linked", createdAt: now, updatedAt: now });
    stubProviders({ google: outsideAddress("g-linked") });

    const location = await signInWith(auth, "google");

    expect(location).toBe(`${origin}/invitations/inv-1`);
    expect(tables.session.map((row) => row.userId)).toEqual([userId]);
  });

  it("should not link a verified Google email when the existing account never confirmed that email", async () => {
    existingUser(tables, { verified: false, github: true });
    stubProviders({ google: workspace("g-1") });

    const location = await signInWith(auth, "google");

    expect(location).toMatch(refusedWith("account_not_linked"));
    expect(googleAccounts()).toEqual([]);
    expect(tables.session).toEqual([]);
  });

  it("should create a confirmed account when a new person signs in with a verified Workspace Google email", async () => {
    stubProviders({ google: workspace("g-new") });

    const location = await signInWith(auth, "google");

    expect(location).toBe(`${origin}/invitations/inv-1`);
    expect(tables.user).toEqual([expect.objectContaining({ email: "sam@example.com", emailVerified: true })]);
    expect(googleAccounts()).toHaveLength(1);
  });

  it("should still link a GitHub sign-in to the matching confirmed account when GitHub verified the email", async () => {
    const userId = existingUser(tables, { verified: true });
    stubProviders({ github: { id: 4242, verified: true } });

    await signInWith(auth, "github");

    expect(tables.account).toEqual([expect.objectContaining({ userId, providerId: "github", accountId: "4242" })]);
    expect(tables.user).toHaveLength(1);
  });

  it("should still refuse to link a GitHub sign-in when GitHub has not verified the email", async () => {
    existingUser(tables, { verified: true });
    stubProviders({ github: { id: 4242, verified: false } });

    const location = await signInWith(auth, "github");

    expect(location).toMatch(refusedWith("account_not_linked"));
    expect(tables.account).toEqual([]);
  });

  it("should still create an account from a magic link when the Google gate is on", async () => {
    stubProviders({});

    const { location } = await magicLinkSession(auth);

    expect(location).toBe(`${origin}/app`);
    expect(tables.user).toEqual([expect.objectContaining({ email: "sam@example.com", emailVerified: true })]);
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

  it("should configure GitHub only when both values are real, trimmed", () => {
    expect(socialProviders({ ...env, GITHUB_CLIENT_ID: ` ${env.GITHUB_CLIENT_ID}\n` }).github?.clientId).toBe(env.GITHUB_CLIENT_ID);
    expect(Object.keys(socialProviders({ ...env, GITHUB_CLIENT_ID: "  " }))).toEqual(["google"]);
    expect(Object.keys(socialProviders({ ...env, GITHUB_CLIENT_SECRET: "replace-with-github-client-secret" }))).toEqual(["google"]);
  });
});
