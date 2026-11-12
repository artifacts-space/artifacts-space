import { createHash, randomBytes, randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * The OAuth token limits end to end: the real auth route, the real Better
 * Auth OAuth provider, and the real Postgres counters, with connections
 * stored the way Better Auth stores them. One hosted app serves many people
 * from one address; these show that ordinary use is never throttled while
 * guessing and loops are, and that Better Auth still sees every replayed
 * token and code. Registration limits are in
 * route-oauth-registration-limits.db.test.ts. Runs only when TEST_DATABASE_URL
 * names a throwaway local database with the migrations applied; never point
 * it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("OAuth endpoint limits with a database", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "oauth-limits-db-test-secret-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", "https://artifacts.space");

  const { and, eq, inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { session, user, verification } = await import("@/db/schema");
  const { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } = await import("@/db/oauth-schema");
  const { rateLimits } = await import("@/lib/abuse/limits");
  const { networkPrefixKey } = await import("@/lib/abuse/network-key");
  const { hashOAuthToken, mcpResource, oauthLimits } = await import("@/lib/oauth/config");
  const { POST } = await import("./route");

  const site = "https://artifacts.space";
  const tag = randomUUID().slice(0, 8);
  const scopes = ["artifacts:read", "artifacts:write", "offline_access"];
  const made = { users: [] as string[], clients: [] as string[] };
  let addressCounter = 0;

  const [runA = 0, runB = 0] = randomBytes(2);

  /** A fresh address per case, so cases never share a counter, and a fresh range per run, so reruns on one database within the hour do not either. */
  function newAddress(): string {
    addressCounter += 1;
    return `10.${String(runA)}.${String((runB + Math.floor(addressCounter / 250)) % 256)}.${String(addressCounter % 250)}`;
  }

  /**
   * A public app, like a hosted assistant's metadata-document client: one
   * client id for all its people. Stored as registered two days ago, outside
   * the pool of unapproved apps that the registration tests fill.
   */
  async function newClient(): Promise<string> {
    const clientId = `https://assistant-${tag}-${String(made.clients.length)}.example/oauth/metadata.json`;
    await getDb().insert(oauthClient).values({
      id: randomUUID(),
      clientId,
      name: "Hosted assistant",
      redirectUris: ["https://assistant.example/callback"],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      scopes,
      requirePKCE: true,
      createdAt: new Date(Date.now() - 2 * 86_400_000),
      updatedAt: new Date(),
    });
    made.clients.push(clientId);
    return clientId;
  }

  /** One person connected to the app: their approval and a refresh token, as Better Auth stores them. Returns the token. */
  async function newConnection(clientId: string): Promise<string> {
    const userId = `oal-${tag}-${randomUUID().slice(0, 8)}`;
    const db = getDb();
    await db.insert(user).values({ id: userId, name: userId, email: `${userId}@example.com` });
    made.users.push(userId);
    await db.insert(oauthConsent).values({ id: randomUUID(), clientId, userId, scopes, createdAt: new Date(), updatedAt: new Date() });
    const secret = randomBytes(24).toString("base64url");
    await db.insert(oauthRefreshToken).values({
      id: randomUUID(),
      token: hashOAuthToken(secret),
      clientId,
      userId,
      scopes,
      resources: [mcpResource()],
      expiresAt: new Date(Date.now() + oauthLimits.refreshTokenSeconds * 1000),
      createdAt: new Date(),
    });
    return `artifacts_ort_${secret}`;
  }

  /**
   * A person who just approved the app in the browser: their session and the
   * authorization code Better Auth would store, bound to a PKCE challenge.
   */
  async function newCode(clientId: string): Promise<{ code: string; verifier: string }> {
    const userId = `oal-${tag}-${randomUUID().slice(0, 8)}`;
    const db = getDb();
    await db.insert(user).values({ id: userId, name: userId, email: `${userId}@example.com` });
    made.users.push(userId);
    const sessionId = randomUUID();
    await db.insert(session).values({ id: sessionId, token: randomBytes(24).toString("base64url"), userId, expiresAt: new Date(Date.now() + 86_400_000) });
    const code = randomBytes(24).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const query = { response_type: "code", client_id: clientId, redirect_uri: "https://assistant.example/callback", scope: scopes.join(" "), state: "s", code_challenge: challenge, code_challenge_method: "S256" };
    await db.insert(verification).values({
      id: randomUUID(),
      identifier: hashOAuthToken(code),
      value: JSON.stringify({ type: "authorization_code", query, userId, sessionId, resource: [mcpResource()] }),
      expiresAt: new Date(Date.now() + 600_000),
    });
    return { code, verifier };
  }

  function exchange(grant: { code: string; verifier: string }, clientId: string, address: string) {
    return tokenRequest({ grant_type: "authorization_code", code: grant.code, code_verifier: grant.verifier, client_id: clientId, redirect_uri: "https://assistant.example/callback" }, address);
  }

  function tokenRequest(body: Record<string, string>, address: string) {
    return POST(new Request(`${site}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": address },
      body: new URLSearchParams(body).toString(),
    }));
  }

  async function refresh(refreshToken: string, clientId: string, address: string) {
    const response = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }, address);
    const body = (await response.json()) as Record<string, unknown>;
    return { status: response.status, body, retryAfter: response.headers.get("retry-after"), next: typeof body.refresh_token === "string" ? body.refresh_token : refreshToken };
  }

  async function bucketTotal(key: string): Promise<number> {
    const { rateLimitBucket } = await import("@/db/schema");
    const rows = await getDb().select({ count: rateLimitBucket.count }).from(rateLimitBucket).where(eq(rateLimitBucket.key, key));
    return rows.reduce((sum, row) => sum + row.count, 0);
  }

  /** Bogus refreshes from `address` until it is over its failure limit. */
  async function overFailureLimit(clientId: string, address: string): Promise<void> {
    for (let attempt = 0; attempt < rateLimits.oauthTokenFailuresByNetwork.limit; attempt += 1) {
      await refresh(`artifacts_ort_${randomBytes(24).toString("base64url")}`, clientId, address);
    }
    expect((await refresh(`artifacts_ort_${randomBytes(24).toString("base64url")}`, clientId, address)).status).toBe(429);
  }

  async function familyOf(refreshToken: string) {
    const [row] = await getDb().select({ userId: oauthRefreshToken.userId }).from(oauthRefreshToken).where(eq(oauthRefreshToken.token, hashOAuthToken(refreshToken.replace("artifacts_ort_", ""))));
    return row?.userId ?? "";
  }

  async function liveFamilyTokens(userId: string, clientId: string): Promise<number> {
    const rows = await getDb().select({ id: oauthRefreshToken.id }).from(oauthRefreshToken).where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, clientId)));
    return rows.length;
  }

  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    const db = getDb();
    if (made.clients.length > 0) await db.delete(oauthClient).where(inArray(oauthClient.clientId, made.clients));
    if (made.users.length > 0) await db.delete(user).where(inArray(user.id, made.users));
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should let 1,000 refreshes from one address succeed when 200 people of one app refresh five times each in bursts", async () => {
    const address = newAddress();
    const clientId = await newClient();
    const tokens = await Promise.all(Array.from({ length: 200 }, () => newConnection(clientId)));

    let succeeded = 0;
    for (let round = 0; round < 5; round += 1) {
      const answers = await Promise.all(tokens.map((token) => refresh(token, clientId, address)));
      answers.forEach((settled, index) => {
        if (settled.status === 200 && String(settled.body.access_token).startsWith("artifacts_oat_") && settled.next !== tokens[index]) succeeded += 1;
        tokens[index] = settled.next;
      });
    }

    expect(succeeded).toBe(1000);
  }, 180_000);

  it("should refuse one connection in a loop at its limit while another connection from the same address still refreshes", async () => {
    const address = newAddress();
    const clientId = await newClient();
    let looping = await newConnection(clientId);
    const calm = await newConnection(clientId);

    for (let attempt = 0; attempt < rateLimits.oauthRefreshByConnection.limit; attempt += 1) {
      const settled = await refresh(looping, clientId, address);
      expect(settled.status).toBe(200);
      looping = settled.next;
    }
    const refused = await refresh(looping, clientId, address);

    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe("rate_limited");
    expect(Number(refused.retryAfter)).toBeGreaterThan(0);
    expect((await refresh(calm, clientId, address)).status).toBe(200);
    // The refused token was never used, so it still works once the loop stops.
    const [stored] = await getDb().select({ revoked: oauthRefreshToken.revoked }).from(oauthRefreshToken).where(eq(oauthRefreshToken.token, hashOAuthToken(looping.replace("artifacts_ort_", ""))));
    expect(stored?.revoked).toBeNull();
  }, 60_000);

  it("should keep valid refreshes and code exchanges working from an address far over its failure limit, and refuse its bad requests unseen", async () => {
    const address = newAddress();
    const clientId = await newClient();
    const existing = await newConnection(clientId);
    const fresh = await newCode(clientId);
    const failureLimit = rateLimits.oauthTokenFailuresByNetwork.limit;

    // Expired, revoked, or bogus credentials: refresh tokens and codes, mixed, three times the limit.
    for (let attempt = 0; attempt < 3 * failureLimit; attempt += 1) {
      const bogus = randomBytes(24).toString("base64url");
      const settled = attempt % 2 === 0
        ? await refresh(`artifacts_ort_${bogus}`, clientId, address)
        : await exchange({ code: bogus, verifier: "v".repeat(43) }, clientId, address);
      expect(settled.status === 400 || settled.status === 429).toBe(true);
    }

    // (a) A correct refresh for an existing connection succeeds.
    const refreshed = await refresh(existing, clientId, address);
    expect(refreshed.status).toBe(200);
    // Issued secrets are 32 random letters (about 182 bits), far past guessing at the backstop's rate.
    expect(String(refreshed.body.access_token)).toMatch(/^artifacts_oat_[A-Za-z]{32}$/);
    expect(String(refreshed.body.refresh_token)).toMatch(/^artifacts_ort_[A-Za-z]{32}$/);

    // (b) A correct code exchange for a new connection succeeds.
    const exchanged = await exchange(fresh, clientId, address);
    expect(exchanged.status).toBe(200);
    expect(await exchanged.json()).toMatchObject({ token_type: "Bearer" });

    // (c) Further bad requests get 429 with Retry-After before Better Auth runs (it would answer 400), and still count.
    const failureKey = `oauthTokenFailuresByNetwork:${networkPrefixKey(new Headers({ "x-forwarded-for": address }))}`;
    const countedBefore = await bucketTotal(failureKey);
    const badRefresh = await refresh(`artifacts_ort_${randomBytes(24).toString("base64url")}`, clientId, address);
    const badCode = await exchange({ code: randomBytes(24).toString("base64url"), verifier: "v".repeat(43) }, clientId, address);
    for (const refused of [badRefresh, { status: badCode.status, body: (await badCode.json()) as Record<string, unknown>, retryAfter: badCode.headers.get("retry-after") }]) {
      expect(refused.status).toBe(429);
      expect(refused.body).toMatchObject({ error: "rate_limited" });
      expect(Number(refused.retryAfter)).toBeGreaterThan(0);
    }
    expect(await bucketTotal(failureKey)).toBe(countedBefore + 2);

    // (d) Another address is unaffected: its bad request reaches Better Auth and gets the ordinary answer.
    const elsewhere = await refresh(`artifacts_ort_${randomBytes(24).toString("base64url")}`, clientId, newAddress());
    expect(elsewhere.status).toBe(400);
    expect(elsewhere.body.error).toBe("invalid_grant");
  }, 60_000);

  it("should send a replayed rotated token to Better Auth from an address over its failure limit, which revokes the family", async () => {
    const appAddress = newAddress();
    const clientId = await newClient();
    const stolen = await newConnection(clientId);
    const userId = await familyOf(stolen);
    const rotated = await refresh(stolen, clientId, newAddress());
    expect(rotated.status).toBe(200);
    // Past the reuse window, a replay of the old token is theft.
    await getDb().update(oauthRefreshToken).set({ rotationReplayExpiresAt: new Date(Date.now() - 1000) }).where(eq(oauthRefreshToken.token, hashOAuthToken(stolen.replace("artifacts_ort_", ""))));
    await overFailureLimit(clientId, appAddress);

    const replayed = await refresh(stolen, clientId, appAddress);

    expect(replayed).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    expect(await liveFamilyTokens(userId, clientId)).toBe(0);
  }, 60_000);

  it("should still revoke the family on the app's replay when a thief used up the stolen token's tries from another address", async () => {
    const appAddress = newAddress();
    const thiefAddress = newAddress();
    const clientId = await newClient();
    const stolen = await newConnection(clientId);
    const userId = await familyOf(stolen);
    const badScope = { grant_type: "refresh_token", refresh_token: stolen, client_id: clientId, scope: "admin:everything" };
    for (let attempt = 0; attempt <= rateLimits.oauthTokenAttemptsByCredential.limit; attempt += 1) expect((await tokenRequest(badScope, thiefAddress)).status).toBe(400);
    const thiefRefresh = await refresh(stolen, clientId, thiefAddress);
    expect(thiefRefresh.status).toBe(200);
    await getDb().update(oauthRefreshToken).set({ rotationReplayExpiresAt: new Date(Date.now() - 1000) }).where(eq(oauthRefreshToken.token, hashOAuthToken(stolen.replace("artifacts_ort_", ""))));
    await overFailureLimit(clientId, appAddress);

    const appReplay = await refresh(stolen, clientId, appAddress);

    expect(appReplay).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    expect(await liveFamilyTokens(userId, clientId)).toBe(0);
  }, 60_000);

  it("should send a used code to Better Auth from an address over its failure limit, which revokes the tokens it issued", async () => {
    const address = newAddress();
    const clientId = await newClient();
    const grant = await newCode(clientId);
    const first = await exchange(grant, clientId, newAddress());
    expect(first.status).toBe(200);
    const issued = (await first.json()) as Record<string, unknown>;
    const userId = await familyOf(String(issued.refresh_token));
    expect(await liveFamilyTokens(userId, clientId)).toBe(1);
    await overFailureLimit(clientId, address);

    const replayed = await exchange(grant, clientId, address);

    expect({ status: replayed.status, error: ((await replayed.json()) as Record<string, unknown>).error }).toEqual({ status: 400, error: "invalid_grant" });
    expect(await liveFamilyTokens(userId, clientId)).toBe(0);
    const accessTokens = await getDb().select({ id: oauthAccessToken.id }).from(oauthAccessToken).where(eq(oauthAccessToken.authorizationCodeId, hashOAuthToken(grant.code)));
    expect(accessTokens).toHaveLength(0);
  }, 60_000);

  it("should answer an expired connection with invalid_grant, not a wait, from an address over its failure limit", async () => {
    const address = newAddress();
    const clientId = await newClient();
    const expired = await newConnection(clientId);
    await getDb().update(oauthRefreshToken).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(oauthRefreshToken.token, hashOAuthToken(expired.replace("artifacts_ort_", ""))));
    await overFailureLimit(clientId, address);

    expect(await refresh(expired, clientId, address)).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
  }, 60_000);

  it("should stop a valid token failed with over and over once its tries run out, from an address over its failure limit", async () => {
    const address = newAddress();
    const clientId = await newClient();
    const mine = await newConnection(clientId);
    await overFailureLimit(clientId, address);
    const badScope = () => tokenRequest({ grant_type: "refresh_token", refresh_token: mine, client_id: clientId, scope: "admin:everything" }, address);

    const answers: number[] = [];
    for (let attempt = 0; attempt <= rateLimits.oauthTokenAttemptsByCredential.limit; attempt += 1) answers.push((await badScope()).status);

    expect(answers.slice(0, -1).every((status) => status === 400)).toBe(true);
    expect(answers.at(-1)).toBe(429);
  }, 60_000);

  it("should let at most the failure limit through to Better Auth when many unknown requests arrive at once", async () => {
    const address = newAddress();
    const clientId = await newClient();

    const statuses = await Promise.all(Array.from({ length: 200 }, () => refresh(`artifacts_ort_${randomBytes(24).toString("base64url")}`, clientId, address).then((settled) => settled.status)));

    expect(statuses.filter((status) => status === 400)).toHaveLength(rateLimits.oauthTokenFailuresByNetwork.limit);
    expect(statuses.filter((status) => status === 429)).toHaveLength(200 - rateLimits.oauthTokenFailuresByNetwork.limit);
  }, 60_000);

  it("should count malformed and wrong-client requests as failures", async () => {
    const address = newAddress();
    const clientId = await newClient();
    const good = await newConnection(clientId);
    const attempts = [
      () => tokenRequest({ grant_type: "password", username: "a", password: "b" }, address),
      () => tokenRequest({ grant_type: "refresh_token", client_id: clientId }, address),
      () => tokenRequest({ grant_type: "refresh_token", refresh_token: good, client_id: "https://unknown.example/meta.json" }, address),
      () => tokenRequest({ grant_type: "authorization_code", code: "made-up", code_verifier: "v".repeat(43), client_id: clientId, redirect_uri: "https://assistant.example/callback" }, address),
    ];
    for (const attempt of attempts) {
      const status = (await attempt()).status;
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    }
    expect(await bucketTotal(`oauthTokenFailuresByNetwork:${networkPrefixKey(new Headers({ "x-forwarded-for": address }))}`)).toBe(attempts.length);
  }, 60_000);

});
