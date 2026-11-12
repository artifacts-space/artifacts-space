import { randomBytes, randomUUID } from "node:crypto";

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

  const { eq, inArray } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { oauthClient, oauthClientResource, oauthConsent, oauthRefreshToken } = await import("@/db/oauth-schema");
  const { rateLimits } = await import("@/lib/abuse/limits");
  const { networkKey } = await import("@/lib/abuse/network-key");
  const { hashOAuthToken, mcpResource, oauthLimits } = await import("@/lib/oauth/config");
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

  it("should refuse every token request from an address at its failure limit, a correct one too, until the window passes", async () => {
    const address = newAddress();
    const clientId = await newClient();
    const good = await newConnection(clientId);

    for (let attempt = 0; attempt < rateLimits.oauthTokenFailuresByNetwork.limit; attempt += 1) {
      const settled = await refresh(`artifacts_ort_${randomBytes(24).toString("base64url")}`, clientId, address);
      expect(settled.status).toBe(400);
      expect(settled.body.error).toBe("invalid_grant");
    }
    const refused = await refresh(good, clientId, address);
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ error: "rate_limited" });
    expect(String(refused.body.error_description)).toContain("failed");
    expect(Number(refused.retryAfter)).toBeGreaterThan(0);
    // Another address is not affected.
    expect((await refresh(good, clientId, newAddress())).status).toBe(200);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + (Number(refused.retryAfter) + 1) * 1000);
    const fresh = await newConnection(clientId);
    expect((await refresh(fresh, clientId, address)).status).toBe(200);
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
});
