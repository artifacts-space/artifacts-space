import { createHash, randomBytes, randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * The OAuth token and registration limits end to end: the real auth route,
 * the real Better Auth OAuth provider, and the real Postgres counters, with
 * connections stored the way Better Auth stores them. One hosted app serves
 * many people from one address; these show that ordinary use is never
 * throttled while guessing and loops are. Runs only when TEST_DATABASE_URL
 * names a throwaway local database with the migrations applied; never point
 * it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("OAuth endpoint limits with a database", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "oauth-limits-db-test-secret-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", "https://artifacts.space");

  const { eq, inArray, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { session, user, verification } = await import("@/db/schema");
  const { oauthClient, oauthClientResource, oauthConsent, oauthRefreshToken } = await import("@/db/oauth-schema");
  const { rateLimits } = await import("@/lib/abuse/limits");
  const { networkKey } = await import("@/lib/abuse/network-key");
  const { hashOAuthToken, mcpResource, oauthLimits } = await import("@/lib/oauth/config");
  const { unapprovedClientCounts } = await import("@/lib/oauth/limit-store");
  const { POST } = await import("./route");

  const site = "https://artifacts.space";
  const tag = randomUUID().slice(0, 8);
  const scopes = ["artifacts:read", "artifacts:write", "offline_access"];
  const made = { users: [] as string[], clients: [] as string[] };
  let addressCounter = 0;

  /** A fresh address per case, so cases never share a counter. */
  function newAddress(): string {
    addressCounter += 1;
    return `10.${String(randomBytes(1)[0] ?? 0)}.${String(Math.floor(addressCounter / 250))}.${String(addressCounter % 250)}`;
  }

  /** A public app, like a hosted assistant's metadata-document client: one client id for all its people. */
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
      createdAt: new Date(),
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

  async function register(address: string) {
    const response = await POST(new Request(`${site}/api/auth/oauth2/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": address },
      body: JSON.stringify({
        client_name: `Registered ${tag}`,
        redirect_uris: ["https://assistant.example/callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    }));
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.client_id === "string") made.clients.push(body.client_id);
    return { status: response.status, body, retryAfter: response.headers.get("retry-after") };
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

    // (c) Further bad requests get 429 with Retry-After, and Better Auth never sees them: a bogus code leaves no trace.
    const { rateLimitBucket } = await import("@/db/schema");
    const failureKey = `oauthTokenFailuresByNetwork:${networkKey(new Headers({ "x-forwarded-for": address }))}`;
    const countedBefore = (await getDb().select({ count: rateLimitBucket.count }).from(rateLimitBucket).where(eq(rateLimitBucket.key, failureKey))).reduce((sum, row) => sum + row.count, 0);
    const badRefresh = await refresh(`artifacts_ort_${randomBytes(24).toString("base64url")}`, clientId, address);
    const badCode = await exchange({ code: randomBytes(24).toString("base64url"), verifier: "v".repeat(43) }, clientId, address);
    for (const refused of [badRefresh, { status: badCode.status, body: (await badCode.json()) as Record<string, unknown>, retryAfter: badCode.headers.get("retry-after") }]) {
      expect(refused.status).toBe(429);
      expect(refused.body).toMatchObject({ error: "rate_limited" });
      expect(Number(refused.retryAfter)).toBeGreaterThan(0);
    }
    const countedAfter = (await getDb().select({ count: rateLimitBucket.count }).from(rateLimitBucket).where(eq(rateLimitBucket.key, failureKey))).reduce((sum, row) => sum + row.count, 0);
    expect(countedAfter).toBe(countedBefore);

    // (d) Another address is unaffected: its bad request reaches Better Auth and gets the ordinary answer.
    const elsewhere = await refresh(`artifacts_ort_${randomBytes(24).toString("base64url")}`, clientId, newAddress());
    expect(elsewhere.status).toBe(400);
    expect(elsewhere.body.error).toBe("invalid_grant");
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
    const { rateLimitBucket } = await import("@/db/schema");
    const key = `oauthTokenFailuresByNetwork:${networkKey(new Headers({ "x-forwarded-for": address }))}`;
    const rows = await getDb().select({ count: rateLimitBucket.count }).from(rateLimitBucket).where(eq(rateLimitBucket.key, key));
    expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(attempts.length);
  }, 60_000);

  it("should register up to the per-address cap of unapproved apps, then go on to the hourly ceiling once people approve them", async () => {
    const address = newAddress();
    const share = oauthLimits.maxUnapprovedClientsPerNetwork;
    const registered: string[] = [];
    for (let attempt = 0; attempt < share; attempt += 1) {
      const settled = await register(address);
      expect(settled.status).toBe(201);
      if (typeof settled.body.client_id === "string") registered.push(settled.body.client_id);
    }

    const network = networkKey(new Headers({ "x-forwarded-for": address }));
    const tagged = await getDb().select({ clientId: oauthClient.clientId }).from(oauthClient).where(eq(oauthClient.registeredNetwork, network));
    expect(tagged).toHaveLength(share);
    const links = await getDb().select({ clientId: oauthClientResource.clientId }).from(oauthClientResource).where(inArray(oauthClientResource.clientId, registered));
    // What a registration costs: one app row and one link to the MCP resource.
    expect(links).toHaveLength(share);

    const capped = await register(address);
    expect(capped.status).toBe(429);
    expect(capped.body.error).toBe("rate_limited");
    expect(Number(capped.retryAfter)).toBeGreaterThan(3600);

    // People finish connecting: approved apps no longer count toward the address's cap.
    const approver = `oal-${tag}-approver`;
    await getDb().insert(user).values({ id: approver, name: approver, email: `${approver}@example.com` });
    made.users.push(approver);
    await getDb().insert(oauthConsent).values(registered.map((clientId) => ({ id: randomUUID(), clientId, userId: approver, scopes, createdAt: new Date(), updatedAt: new Date() })));

    let accepted = share;
    for (;;) {
      const settled = await register(address);
      if (settled.status !== 201) break;
      accepted += 1;
      if (typeof settled.body.client_id === "string") {
        await getDb().insert(oauthConsent).values({ id: randomUUID(), clientId: settled.body.client_id, userId: approver, scopes, createdAt: new Date(), updatedAt: new Date() });
      }
    }
    // The hourly limit counts every registration it lets past, the one the cap refused included.
    expect(accepted + 1).toBe(rateLimits.oauthRegister.limit);

    const ceiling = await register(address);
    expect(ceiling.status).toBe(429);
    expect(ceiling.body).toMatchObject({ error: "rate_limited" });
    expect(String(ceiling.body.error_description)).toContain("registered a lot of apps in the last hour");
    expect(Number(ceiling.retryAfter)).toBeGreaterThan(0);
    // Another address can still register.
    expect((await register(newAddress())).status).toBe(201);
  }, 180_000);

  describe("a full pool of unapproved apps", () => {
    const fillPrefix = `fill-${tag}-`;
    const fillAddress = "192.0.2.77";
    const fillNetwork = networkKey(new Headers({ "x-forwarded-for": fillAddress }));
    const minute = 60_000;

    async function poolSize(): Promise<number> {
      return (await unapprovedClientCounts("none")).total;
    }

    /** Unapproved apps registered `ageMs` ago until the pool is full; returns their ids, oldest first when ages differ. */
    async function fillPool(ageMs: number, count?: number): Promise<string[]> {
      const missing = count ?? oauthLimits.maxUnapprovedClients - (await poolSize());
      const createdAt = new Date(Date.now() - ageMs);
      const rows = Array.from({ length: missing }, (_, index) => ({
        id: randomUUID(),
        clientId: `${fillPrefix}${randomUUID()}`,
        redirectUris: ["https://assistant.example/callback"],
        tokenEndpointAuthMethod: "none",
        registeredNetwork: fillNetwork,
        createdAt: new Date(createdAt.getTime() - index),
        updatedAt: createdAt,
      }));
      for (let start = 0; start < rows.length; start += 500) await getDb().insert(oauthClient).values(rows.slice(start, start + 500));
      return rows.map((row) => row.clientId);
    }

    async function stillThere(clientIds: string[]): Promise<number> {
      return (await getDb().select({ clientId: oauthClient.clientId }).from(oauthClient).where(inArray(oauthClient.clientId, clientIds))).length;
    }

    afterEach(async () => {
      await getDb().delete(oauthClient).where(like(oauthClient.clientId, `${fillPrefix}%`));
      if (made.clients.length > 0) await getDb().delete(oauthClient).where(inArray(oauthClient.clientId, made.clients));
      made.clients.length = 0;
    });

    it("should register a new app, evict the oldest unapproved one, and still count it for its network when the pool is full of old apps", async () => {
      const [oldest] = await fillPool(2 * 60 * minute, 1);
      await fillPool(60 * minute);
      expect(await poolSize()).toBe(oauthLimits.maxUnapprovedClients);
      const before = await unapprovedClientCounts(fillNetwork);

      const registered = await register(newAddress());

      expect(registered.status).toBe(201);
      expect(await stillThere([oldest ?? ""])).toBe(0);
      expect(await poolSize()).toBe(oauthLimits.maxUnapprovedClients);
      const after = await unapprovedClientCounts(fillNetwork);
      expect(after.fromNetwork + after.evictedFromNetwork).toBe(before.fromNetwork + before.evictedFromNetwork);
      // The evicted client id now fails like any unknown client.
      const evictedUse = await tokenRequest({ grant_type: "authorization_code", code: "c", code_verifier: "v".repeat(43), client_id: oldest ?? "", redirect_uri: "https://assistant.example/callback" }, newAddress());
      const evictedBody = (await evictedUse.json()) as Record<string, unknown>;
      expect({ status: evictedUse.status, error: evictedBody.error }).toEqual({ status: 400, error: "invalid_client" });
    }, 120_000);

    it("should never evict an approved app when the oldest app in the table is approved", async () => {
      const approved = await newClient();
      await getDb().update(oauthClient).set({ createdAt: new Date(Date.now() - 3 * 60 * minute) }).where(eq(oauthClient.clientId, approved));
      await newConnection(approved);
      await fillPool(60 * minute);

      expect((await register(newAddress())).status).toBe(201);
      expect(await stillThere([approved])).toBe(1);
      expect(await poolSize()).toBe(oauthLimits.maxUnapprovedClients);
    }, 120_000);

    it("should answer 503 with Retry-After and store nothing when every unapproved app is inside the grace period", async () => {
      await fillPool(minute);
      const before = await poolSize();

      const refused = await register(newAddress());

      expect(refused.status).toBe(503);
      expect(refused.body).toMatchObject({ error: "temporarily_unavailable" });
      expect(Number(refused.retryAfter)).toBeGreaterThanOrEqual(60);
      expect(Number(refused.retryAfter)).toBeLessThanOrEqual(oauthLimits.unapprovedEvictionGraceMinutes * 60);
      expect(await poolSize()).toBe(before);
    }, 120_000);

    it("should leave the pool at its cap when two registrations arrive at once at a full pool", async () => {
      await fillPool(60 * minute);

      const both = await Promise.all([register(newAddress()), register(newAddress())]);

      expect(both.map((settled) => settled.status)).toEqual([201, 201]);
      expect(await poolSize()).toBe(oauthLimits.maxUnapprovedClients);
    }, 120_000);
  });
});
