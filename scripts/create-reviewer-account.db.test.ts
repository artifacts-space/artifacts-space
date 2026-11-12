import { createHash, randomBytes, randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

/*
 * The owner's reviewer script against a real Postgres, with the app's real
 * auth route on top: it creates an account that signs in with its password,
 * refuses an address that already has an ordinary account (it never adds a
 * password to one), and a reset cuts every other way in. Before the reset
 * the old password, an MCP app's refresh and access tokens, the person's
 * access token, and their agent's token all work; after it none does.
 * Runs only when TEST_DATABASE_URL names a throwaway local database with the
 * migrations applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
const origin = "http://localhost:3000";
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.BETTER_AUTH_URL = origin;
  process.env.BETTER_AUTH_SECRET ??= "db-test-only-secret-0123456789abcdef";
}

describe.runIf(Boolean(databaseUrl))("reviewer accounts with a database", async () => {
  const { eq } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { account, agent, teamMember, user } = await import("@/db/schema");
  const { GET, POST } = await import("@/app/api/auth/[...all]/route");
  const { authenticateApiToken, createApiToken } = await import("@/lib/tokens");
  const { authenticateOAuthAccessToken } = await import("@/lib/oauth/clients");
  const { mcpResource } = await import("@/lib/oauth/config");
  const { findPersonalTeam } = await import("@/lib/teams/queries");
  const { ReviewerAccountRefusal, writeAccount } = await import("./create-reviewer-account.mts");

  const url = databaseUrl ?? "";
  const tag = randomUUID().slice(0, 8);
  const emails: string[] = [];
  const clients: string[] = [];
  let counter = 0;

  function request(username: string, resetPassword = false) {
    const email = `reviewer-db-${tag}-${username}@example.com`;
    if (!emails.includes(email)) emails.push(email);
    return { email, name: "Directory reviewer", username: `rv-${tag}-${username}`, resetPassword };
  }

  /** A fresh network address per call, so the sign-in limits never get in the way. */
  function headers(extra: Record<string, string> = {}) {
    counter += 1;
    return { origin, "x-forwarded-for": `198.18.${String(counter % 250)}.${String((counter % 200) + 1)}`, ...extra };
  }

  async function signIn(email: string, password: string) {
    return POST(new Request(`${origin}/api/auth/sign-in/email`, { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify({ email, password }) }));
  }

  const cookieOf = (response: Response) => response.headers.getSetCookie().map((cookie) => cookie.split(";")[0] ?? "").join("; ");

  async function userIdOf(email: string) {
    const [row] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
    if (!row) throw new Error("No such user.");
    return row.id;
  }

  /** Registers an MCP client, approves it as the signed-in person, and exchanges the code: the app's real OAuth flow. */
  async function connectApp(cookie: string) {
    const redirectUri = "http://127.0.0.1:9/callback";
    const registered = await POST(new Request(`${origin}/api/auth/oauth2/register`, {
      method: "POST",
      headers: headers({ "content-type": "application/json" }),
      body: JSON.stringify({ client_name: `Reset test ${tag}`, redirect_uris: [redirectUri], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
    }));
    const { client_id: clientId } = (await registered.json()) as { client_id: string };
    clients.push(clientId);
    const verifier = randomBytes(32).toString("base64url");
    const query = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: "s", resource: mcpResource() });
    const authorized = await GET(new Request(`${origin}/api/auth/oauth2/authorize?${query.toString()}`, { headers: headers({ cookie }) }));
    const consentUrl = new URL(authorized.headers.get("location") ?? "", origin);
    const consent = await POST(new Request(`${origin}/api/auth/oauth2/consent`, {
      method: "POST",
      headers: headers({ "content-type": "application/json", accept: "application/json", cookie }),
      body: JSON.stringify({ accept: true, scope: consentUrl.searchParams.get("scope") ?? "", oauth_query: consentUrl.search.slice(1) }),
    }));
    const code = new URL(((await consent.json()) as { url: string }).url).searchParams.get("code") ?? "";
    const exchange = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource: mcpResource() });
    const tokens = (await exchange.json()) as { access_token: string; refresh_token: string };
    return { clientId, ...tokens };
  }

  function tokenRequest(fields: Record<string, string>) {
    return POST(new Request(`${origin}/api/auth/oauth2/token`, { method: "POST", headers: headers({ "content-type": "application/x-www-form-urlencoded" }), body: new URLSearchParams(fields).toString() }));
  }

  /** An agent the reviewer added to their personal team, with an access token. */
  async function agentToken(ownerId: string) {
    const agentId = `rv-agent-${tag}-${String((counter += 1))}`;
    const team = await findPersonalTeam(ownerId);
    if (!team) throw new Error("No personal team.");
    await getDb().insert(user).values({ id: agentId, name: "Reviewer agent", email: `${agentId}@agents.invalid` });
    await getDb().insert(agent).values({ userId: agentId, teamId: team.id, ownerId });
    await getDb().insert(teamMember).values({ id: randomUUID(), teamId: team.id, userId: agentId, role: "member" });
    return (await createApiToken(agentId, "Agent token")).token;
  }

  afterAll(async () => {
    const { inArray, like, or } = await import("drizzle-orm");
    const { team } = await import("@/db/schema");
    const { oauthClient } = await import("@/db/oauth-schema");
    if (clients.length > 0) await getDb().delete(oauthClient).where(inArray(oauthClient.clientId, clients));
    await getDb().delete(team).where(like(team.slug, `rv-${tag}-%`));
    await getDb().delete(user).where(or(inArray(user.email, emails), like(user.id, `rv-agent-${tag}-%`)));
  });

  it("should create an account that signs in with its password and holds the samples", async () => {
    const created = request("create");
    await writeAccount(url, created, await hashPassword("first-password-0123456789abcdef"));

    const response = await signIn(created.email, "first-password-0123456789abcdef");

    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("token");
    const logins = await getDb().select({ providerId: account.providerId }).from(account).where(eq(account.userId, await userIdOf(created.email)));
    expect(logins.map((row) => row.providerId)).toEqual(["credential"]);
  });

  it("should refuse to create or reset an account for an address that already has an ordinary account", async () => {
    const ordinary = request("ordinary");
    const ordinaryId = `rv-${tag}-ordinary-user`;
    await getDb().insert(user).values({ id: ordinaryId, name: "Ordinary", email: ordinary.email, emailVerified: true });

    await expect(writeAccount(url, ordinary, await hashPassword("x-password-0123456789abcdefgh"))).rejects.toBeInstanceOf(ReviewerAccountRefusal);
    await expect(writeAccount(url, { ...ordinary, resetPassword: true }, await hashPassword("x-password-0123456789abcdefgh"))).rejects.toBeInstanceOf(ReviewerAccountRefusal);

    expect(await getDb().select().from(account).where(eq(account.userId, ordinaryId))).toEqual([]);
  });

  it("should refuse to reset an address with no account", async () => {
    await expect(writeAccount(url, request("missing", true), await hashPassword("x-password-0123456789abcdefgh"))).rejects.toBeInstanceOf(ReviewerAccountRefusal);
  });

  it("should cut the old password, sessions, app tokens, access tokens, and agent tokens when the password is reset", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reviewer = request("reset");
    await writeAccount(url, reviewer, await hashPassword("old-password-0123456789abcdef"));
    const userId = await userIdOf(reviewer.email);
    const cookie = cookieOf(await signIn(reviewer.email, "old-password-0123456789abcdef"));
    const app = await connectApp(cookie);
    const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: app.refresh_token, client_id: app.clientId, resource: mcpResource() });
    expect(refreshed.status).toBe(200);
    const { refresh_token: refreshToken, access_token: accessToken } = (await refreshed.json()) as { refresh_token: string; access_token: string };
    const personToken = (await createApiToken(userId, "Reviewer token")).token;
    const agentsToken = await agentToken(userId);
    expect(await authenticateOAuthAccessToken(accessToken, mcpResource())).not.toBeNull();
    expect(await authenticateApiToken(personToken)).not.toBeNull();
    expect(await authenticateApiToken(agentsToken)).not.toBeNull();

    await writeAccount(url, { ...reviewer, resetPassword: true }, await hashPassword("new-password-0123456789abcdef"));

    expect((await signIn(reviewer.email, "old-password-0123456789abcdef")).status).toBe(401);
    expect((await signIn(reviewer.email, "new-password-0123456789abcdef")).status).toBe(200);
    expect((await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: app.clientId, resource: mcpResource() })).status).not.toBe(200);
    expect(await authenticateOAuthAccessToken(accessToken, mcpResource())).toBeNull();
    expect(await authenticateApiToken(personToken)).toBeNull();
    expect(await authenticateApiToken(agentsToken)).toBeNull();
    const session = await GET(new Request(`${origin}/api/auth/get-session?disableCookieCache=true`, { headers: headers({ cookie }) }));
    expect(await session.json()).toBeNull();
  });

  it("should lift the address's failure ceiling when the password is reset with the site's secret", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { rateLimitBucket } = await import("@/db/schema");
    const { rateLimits } = await import("@/lib/abuse/limits");
    const { windowStart } = await import("@/lib/abuse/rate-limit-window");
    const { passwordFailureBucketKey } = await import("@/lib/auth/password-sign-in-limits");
    const reviewer = request("ceiling");
    const secret = process.env.BETTER_AUTH_SECRET ?? "";
    await writeAccount(url, reviewer, await hashPassword("old-password-0123456789abcdef"));
    // A day of failures from many networks, as the ceiling stores them.
    const { limit, windowSeconds } = rateLimits.passwordSignInFailuresByEmail;
    const windowMs = windowSeconds * 1000;
    const current = windowStart(Date.now(), windowMs);
    const key = passwordFailureBucketKey(reviewer.email, secret);
    await getDb().insert(rateLimitBucket).values([
      { key, windowStart: new Date(current), count: limit },
      { key, windowStart: new Date(current - windowMs), count: limit },
    ]);

    await writeAccount(url, { ...reviewer, resetPassword: true }, await hashPassword("mid-password-0123456789abcdef"));
    expect((await signIn(reviewer.email, "mid-password-0123456789abcdef")).status).toBe(429);

    await writeAccount(url, { ...reviewer, resetPassword: true }, await hashPassword("new-password-0123456789abcdef"), secret);
    expect((await signIn(reviewer.email, "new-password-0123456789abcdef")).status).toBe(200);
  });
});
