import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * The OAuth registration limits end to end: the real auth route, the real
 * Better Auth OAuth provider, and real Postgres. A hosted app registers a new
 * app for each connection from a few shared addresses; these show that it
 * makes room for itself instead of being locked out, that nothing approved
 * or in use is ever evicted, that concurrent registrations never overshoot a
 * cap, and that the registering address is forgotten on time. They fill the
 * shared pool, so they are kept apart from every other test's apps (the token
 * tests store theirs outside the pool's window). Runs only when
 * TEST_DATABASE_URL names a throwaway local database with the migrations
 * applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("OAuth registration limits with a database", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "oauth-limits-db-test-secret-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", "https://artifacts.space");

  const { eq, inArray, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { oauthAccessToken, oauthClient, oauthClientResource, oauthConsent, oauthRefreshToken } = await import("@/db/oauth-schema");
  const { rateLimits } = await import("@/lib/abuse/limits");
  const { networkPrefixKey } = await import("@/lib/abuse/network-key");
  const { oauthLimits } = await import("@/lib/oauth/config");
  const { clearRegisteredNetworks, forgetApprovedClientNetworks, unapprovedClientCounts } = await import("@/lib/oauth/limit-store");
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

  /** An approved-style public app inserted directly, as a metadata-document client would be stored. */
  async function newClient(): Promise<string> {
    const clientId = `https://assistant-${tag}-${randomUUID().slice(0, 8)}.example/oauth/metadata.json`;
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

  function tokenRequest(body: Record<string, string>, address: string) {
    return POST(new Request(`${site}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": address },
      body: new URLSearchParams(body).toString(),
    }));
  }

  /** A dynamic client registration from `address`, as a hosted app sends one per connection. */
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

  afterAll(async () => {
    const db = getDb();
    if (made.clients.length > 0) await db.delete(oauthClient).where(inArray(oauthClient.clientId, made.clients));
    if (made.users.length > 0) await db.delete(user).where(inArray(user.id, made.users));
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should register up to the per-address cap of unapproved apps, then go on to the hourly ceiling once people approve them", async () => {
    const address = newAddress();
    const share = oauthLimits.maxUnapprovedClientsPerNetwork;
    const registered: string[] = [];
    for (let attempt = 0; attempt < share; attempt += 1) {
      const settled = await register(address);
      expect(settled.status).toBe(201);
      if (typeof settled.body.client_id === "string") registered.push(settled.body.client_id);
    }

    const network = networkPrefixKey(new Headers({ "x-forwarded-for": address }));
    const tagged = await getDb().select({ clientId: oauthClient.clientId }).from(oauthClient).where(eq(oauthClient.registeredNetwork, network));
    expect(tagged).toHaveLength(share);
    const links = await getDb().select({ clientId: oauthClientResource.clientId }).from(oauthClientResource).where(inArray(oauthClientResource.clientId, registered));
    // What a registration costs: one app row and one link to the MCP resource.
    expect(links).toHaveLength(share);

    // All of them are inside the grace period, so none can make room.
    const capped = await register(address);
    expect(capped.status).toBe(429);
    expect(capped.body.error).toBe("rate_limited");
    expect(Number(capped.retryAfter)).toBeGreaterThan(0);
    expect(Number(capped.retryAfter)).toBeLessThanOrEqual(oauthLimits.unapprovedEvictionGraceMinutes * 60);

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
    const fillNetwork = networkPrefixKey(new Headers({ "x-forwarded-for": fillAddress }));
    const minute = 60_000;

    async function poolSize(): Promise<number> {
      return (await unapprovedClientCounts("none")).total;
    }

    /** Unapproved apps registered `ageMs` ago until the pool is full (or `count` of them); returns their ids, newest first. */
    async function fillPool(ageMs: number, count?: number, network: string | null = fillNetwork): Promise<string[]> {
      const missing = count ?? oauthLimits.maxUnapprovedClients - (await poolSize());
      const createdAt = new Date(Date.now() - ageMs);
      const rows = Array.from({ length: missing }, (_, index) => ({
        id: randomUUID(),
        clientId: `${fillPrefix}${randomUUID()}`,
        redirectUris: ["https://assistant.example/callback"],
        tokenEndpointAuthMethod: "none",
        registeredNetwork: network,
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

    it("should register a new app and evict the oldest unapproved one when the pool is full of old apps", async () => {
      const [oldest] = await fillPool(2 * 60 * minute, 1, null);
      await fillPool(60 * minute, undefined, null);
      expect(await poolSize()).toBe(oauthLimits.maxUnapprovedClients);

      const registered = await register(newAddress());

      expect(registered.status).toBe(201);
      expect(await stillThere([oldest ?? ""])).toBe(0);
      expect(await poolSize()).toBe(oauthLimits.maxUnapprovedClients);
      // The evicted client id now fails like any unknown client.
      const evictedUse = await tokenRequest({ grant_type: "authorization_code", code: "c", code_verifier: "v".repeat(43), client_id: oldest ?? "", redirect_uri: "https://assistant.example/callback" }, newAddress());
      const evictedBody = (await evictedUse.json()) as Record<string, unknown>;
      expect({ status: evictedUse.status, error: evictedBody.error }).toEqual({ status: 400, error: "invalid_client" });
    }, 120_000);

    /** An app registered three hours ago, older than every app fillPool makes. */
    async function oldApp(): Promise<string> {
      const clientId = await newClient();
      await getDb().update(oauthClient).set({ createdAt: new Date(Date.now() - 3 * 60 * minute) }).where(eq(oauthClient.clientId, clientId));
      return clientId;
    }

    async function newUser(): Promise<string> {
      const userId = `oal-${tag}-${randomUUID().slice(0, 8)}`;
      await getDb().insert(user).values({ id: userId, name: userId, email: `${userId}@example.com` });
      made.users.push(userId);
      return userId;
    }

    async function approve(clientId: string): Promise<void> {
      await getDb().insert(oauthConsent).values({ id: randomUUID(), clientId, userId: await newUser(), scopes, createdAt: new Date(), updatedAt: new Date() });
    }

    async function giveAccessToken(clientId: string): Promise<void> {
      await getDb().insert(oauthAccessToken).values({ id: randomUUID(), token: randomBytes(16).toString("hex"), clientId, scopes, createdAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) });
    }

    async function giveRefreshToken(clientId: string): Promise<void> {
      await getDb().insert(oauthRefreshToken).values({ id: randomUUID(), token: randomBytes(16).toString("hex"), clientId, userId: await newUser(), scopes, createdAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) });
    }

    const exclusions: [string, (clientId: string) => Promise<void>][] = [
      ["was approved and holds no tokens", approve],
      ["holds only a refresh token", giveRefreshToken],
      ["holds only an access token", giveAccessToken],
      ["came from a metadata document", async (clientId) => {
        await getDb().update(oauthClient).set({ clientDiscoveryId: randomUUID() }).where(eq(oauthClient.clientId, clientId));
      }],
    ];

    it.each(exclusions)("should never evict the oldest app when it %s", async (_label, mark) => {
      const kept = await oldApp();
      await mark(kept);
      await fillPool(60 * minute, undefined, null);

      expect((await register(newAddress())).status).toBe(201);
      expect(await stillThere([kept])).toBe(1);
      expect(await poolSize()).toBe(oauthLimits.maxUnapprovedClients);
    }, 120_000);

    it("should answer 503 with Retry-After and store nothing when every unapproved app is inside the grace period", async () => {
      await fillPool(minute, undefined, null);
      const before = await poolSize();

      const refused = await register(newAddress());


      expect(refused.status).toBe(503);
      expect(refused.body).toMatchObject({ error: "temporarily_unavailable" });
      expect(Number(refused.retryAfter)).toBeGreaterThanOrEqual(60);
      expect(Number(refused.retryAfter)).toBeLessThanOrEqual(oauthLimits.unapprovedEvictionGraceMinutes * 60);
      expect(await poolSize()).toBe(before);
    }, 120_000);

    it("should leave the pool at its cap when two registrations arrive at once at a full pool", async () => {
      await fillPool(60 * minute, undefined, null);

      const both = await Promise.all([register(newAddress()), register(newAddress())]);

      expect(both.map((settled) => settled.status)).toEqual([201, 201]);
      expect(await poolSize()).toBe(oauthLimits.maxUnapprovedClients);
    }, 120_000);
  });

  describe("one address's share of unapproved apps", () => {
    const sharePrefix = `share-${tag}-`;
    const share = oauthLimits.maxUnapprovedClientsPerNetwork;
    const minute = 60_000;

    function networkOf(address: string): string {
      return networkPrefixKey(new Headers({ "x-forwarded-for": address }));
    }

    /** `count` unapproved apps this address registered `ageMs` ago; returns their ids, newest first. */
    async function fillShare(address: string, ageMs: number, count: number): Promise<string[]> {
      const createdAt = new Date(Date.now() - ageMs);
      const rows = Array.from({ length: count }, (_, index) => ({
        id: randomUUID(),
        clientId: `${sharePrefix}${randomUUID()}`,
        redirectUris: ["https://assistant.example/callback"],
        tokenEndpointAuthMethod: "none",
        registeredNetwork: networkOf(address),
        createdAt: new Date(createdAt.getTime() - index),
        updatedAt: createdAt,
      }));
      await getDb().insert(oauthClient).values(rows);
      return rows.map((row) => row.clientId);
    }

    async function stillThere(clientIds: string[]): Promise<number> {
      return (await getDb().select({ clientId: oauthClient.clientId }).from(oauthClient).where(inArray(oauthClient.clientId, clientIds))).length;
    }

    afterEach(async () => {
      await getDb().delete(oauthClient).where(like(oauthClient.clientId, `${sharePrefix}%`));
      if (made.clients.length > 0) await getDb().delete(oauthClient).where(inArray(oauthClient.clientId, made.clients));
      made.clients.length = 0;
    });

    it("should register and evict the address's own oldest unapproved app when its share is full of apps past the grace period", async () => {
      const address = newAddress();
      const apps = await fillShare(address, 60 * minute, share);

      const registered = await register(address);

      expect(registered.status).toBe(201);
      expect(await stillThere([apps.at(-1) ?? ""])).toBe(0);
      expect(await stillThere(apps.slice(0, -1))).toBe(share - 1);
      expect((await unapprovedClientCounts(networkOf(address))).fromNetwork).toBe(share);
    }, 60_000);

    it("should refuse with 429 until the oldest leaves the grace period and store nothing when the address's share is all newer apps", async () => {
      const address = newAddress();
      await fillShare(address, minute, share);

      const refused = await register(address);

      expect(refused).toMatchObject({ status: 429, body: { error: "rate_limited" } });
      expect(Number(refused.retryAfter)).toBeLessThanOrEqual(oauthLimits.unapprovedEvictionGraceMinutes * 60);
      expect((await unapprovedClientCounts(networkOf(address))).fromNetwork).toBe(share);
    }, 60_000);

    it("should hold one IPv6 /64 to one share while another /64 and another IPv4 address keep theirs", async () => {
      const prefix = `2001:db8:${String(runA)}:${String(runB)}`;
      await fillShare(`${prefix}::1`, minute, share);
      const ipv4 = newAddress();
      await fillShare(ipv4, minute, share);

      expect((await register(`${prefix}::2`)).status).toBe(429);
      expect((await register(`2001:db8:${String(runA)}:${String((runB + 1) % 256)}::1`)).status).toBe(201);
      // The IPv4 address's share is full, but its neighbour's is not.
      expect((await register(ipv4)).status).toBe(429);
      expect((await register(newAddress())).status).toBe(201);
    }, 60_000);

    it("should never leave an address over its share when 40 registrations from it arrive at once", async () => {
      const oldAddress = newAddress();
      await fillShare(oldAddress, 60 * minute, share);
      const youngAddress = newAddress();
      await fillShare(youngAddress, minute, share - 20);

      const [fromOld, fromYoung] = await Promise.all([
        Promise.all(Array.from({ length: 40 }, () => register(oldAddress))),
        Promise.all(Array.from({ length: 40 }, () => register(youngAddress))),
      ]);

      expect(fromOld.every((settled) => settled.status === 201)).toBe(true);
      expect((await unapprovedClientCounts(networkOf(oldAddress))).fromNetwork).toBe(share);
      const youngStored = (await unapprovedClientCounts(networkOf(youngAddress))).fromNetwork;
      expect(youngStored).toBeLessThanOrEqual(share);
      expect(youngStored).toBe(share - 20 + fromYoung.filter((settled) => settled.status === 201).length);
      expect(fromYoung.filter((settled) => settled.status !== 201).every((settled) => settled.status === 429)).toBe(true);
    }, 120_000);

    it("should forget the address of approved apps and of apps past the tag lifetime, and keep it for young unapproved ones", async () => {
      const address = newAddress();
      const [approvedApp, oldApp, youngApp] = await fillShare(address, minute, 3);
      await getDb().update(oauthClient).set({ createdAt: new Date(Date.now() - (oauthLimits.registeredNetworkHours + 1) * 3_600_000) }).where(eq(oauthClient.clientId, oldApp ?? ""));
      const approver = `oal-${tag}-${randomUUID().slice(0, 8)}`;
      await getDb().insert(user).values({ id: approver, name: approver, email: `${approver}@example.com` });
      made.users.push(approver);
      await getDb().insert(oauthConsent).values({ id: randomUUID(), clientId: approvedApp ?? "", userId: approver, scopes, createdAt: new Date(), updatedAt: new Date() });

      expect(await forgetApprovedClientNetworks()).toBeGreaterThanOrEqual(1);
      // What the cleanup job runs every 6 hours (cleanupOAuth).
      await clearRegisteredNetworks();

      const tags = await getDb().select({ clientId: oauthClient.clientId, network: oauthClient.registeredNetwork }).from(oauthClient).where(inArray(oauthClient.clientId, [approvedApp ?? "", oldApp ?? "", youngApp ?? ""]));
      const tagOf = new Map(tags.map((row) => [row.clientId, row.network]));
      expect(tagOf.get(approvedApp ?? "")).toBeNull();
      expect(tagOf.get(oldApp ?? "")).toBeNull();
      expect(tagOf.get(youngApp ?? "")).toBe(networkOf(address));
    }, 60_000);
  });
});
