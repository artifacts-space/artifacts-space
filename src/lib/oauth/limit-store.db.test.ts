import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

/*
 * The SQL behind the OAuth registration limits (limit-store.ts), called
 * directly on real Postgres: what a trim deletes and what it never deletes,
 * what the counts count, and when a registering address is forgotten.
 *
 * Every app here is registered on a clock far in the past and each function
 * gets that clock as `now`. So these apps are outside the window every other
 * test's pool counts, and nothing here moves an app another test stores. The
 * trims work on one network's share only: the pool is one shared number, and
 * route-oauth-registration-limits.db.test.ts, which owns it, covers the same
 * statement with the pool scope through the route. Runs only when
 * TEST_DATABASE_URL names a throwaway local database with the migrations
 * applied; never point it at a shared one.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

describe.runIf(Boolean(databaseUrl))("OAuth limit store with a database", async () => {
  const { eq, inArray, like } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { user } = await import("@/db/schema");
  const { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } = await import("@/db/oauth-schema");
  const { oauthLimits } = await import("./config");
  const store = await import("./limit-store");

  const tag = randomUUID().slice(0, 8);
  const prefix = `store-${tag}-`;
  const scopes = ["artifacts:read", "offline_access"];
  const share = oauthLimits.maxUnapprovedClientsPerNetwork;
  const minute = 60_000;
  const hour = 60 * minute;
  /** The clock every call here runs on. */
  const now = Date.UTC(2001, 0, 15, 12);
  const users: string[] = [];
  let networks = 0;

  /** A network of its own per case, so cases never share a share. */
  function newNetwork(): string {
    networks += 1;
    return `${prefix}network-${String(networks)}`;
  }

  /** `count` unapproved apps `network` registered `ageMs` before the clock; returns their ids, newest first. */
  async function apps(network: string | null, ageMs: number, count: number): Promise<string[]> {
    const rows = Array.from({ length: count }, (_, index) => ({
      id: randomUUID(),
      clientId: `${prefix}${randomUUID()}`,
      redirectUris: ["https://assistant.example/callback"],
      tokenEndpointAuthMethod: "none",
      registeredNetwork: network,
      createdAt: new Date(now - ageMs - index),
      updatedAt: new Date(now - ageMs),
    }));
    await getDb().insert(oauthClient).values(rows);
    return rows.map((row) => row.clientId);
  }

  async function app(network: string | null, ageMs: number): Promise<string> {
    const [clientId = ""] = await apps(network, ageMs, 1);
    return clientId;
  }

  async function newUser(): Promise<string> {
    const userId = `${prefix}${randomUUID().slice(0, 8)}`;
    await getDb().insert(user).values({ id: userId, name: userId, email: `${userId}@example.com` });
    users.push(userId);
    return userId;
  }

  async function approve(clientId: string): Promise<void> {
    await getDb().insert(oauthConsent).values({ id: randomUUID(), clientId, userId: await newUser(), scopes, createdAt: new Date(now), updatedAt: new Date(now) });
  }

  async function giveAccessToken(clientId: string): Promise<void> {
    await getDb().insert(oauthAccessToken).values({ id: randomUUID(), token: randomBytes(16).toString("hex"), clientId, scopes, createdAt: new Date(now), expiresAt: new Date(now + hour) });
  }

  async function giveRefreshToken(clientId: string): Promise<void> {
    await getDb().insert(oauthRefreshToken).values({ id: randomUUID(), token: randomBytes(16).toString("hex"), clientId, userId: await newUser(), scopes, createdAt: new Date(now), expiresAt: new Date(now + hour) });
  }

  async function fromMetadataDocument(clientId: string): Promise<void> {
    await getDb().update(oauthClient).set({ clientDiscoveryId: randomUUID() }).where(eq(oauthClient.clientId, clientId));
  }

  async function withoutRegistrationTime(clientId: string): Promise<void> {
    await getDb().update(oauthClient).set({ createdAt: null }).where(eq(oauthClient.clientId, clientId));
  }

  /** Which of these apps are still stored. */
  async function stored(clientIds: readonly string[]): Promise<Set<string>> {
    const rows = await getDb().select({ clientId: oauthClient.clientId }).from(oauthClient).where(inArray(oauthClient.clientId, [...clientIds]));
    return new Set(rows.map((row) => row.clientId));
  }

  async function shareSize(network: string): Promise<number> {
    return (await store.unapprovedClientCounts(network, now)).fromNetwork;
  }

  async function tagOf(clientId: string): Promise<string | null | undefined> {
    const [row] = await getDb().select({ network: oauthClient.registeredNetwork }).from(oauthClient).where(eq(oauthClient.clientId, clientId));
    return row?.network;
  }

  function trim(clientId: string, network: string) {
    return store.trimUnapproved(clientId, { kind: "network", network }, now);
  }

  afterAll(async () => {
    await getDb().delete(oauthClient).where(like(oauthClient.clientId, `${prefix}%`));
    if (users.length > 0) await getDb().delete(user).where(inArray(user.id, users));
  });

  describe("trimUnapproved on one network's share", () => {
    it("should evict only the network's oldest apps past the grace period when its share is over the cap", async () => {
      const network = newNetwork();
      const old = await apps(network, hour, share + 2);
      const added = await app(network, 0);

      expect(await trim(added, network)).toEqual({ evicted: 3, dropped: false });

      const left = await stored([...old, added]);
      expect(old.slice(-3).some((clientId) => left.has(clientId))).toBe(false);
      expect(old.slice(0, -3).every((clientId) => left.has(clientId))).toBe(true);
      expect(left.has(added)).toBe(true);
      expect(await shareSize(network)).toBe(share);
    });

    it("should delete nothing when the new app brings the share to its cap", async () => {
      const network = newNetwork();
      const old = await apps(network, hour, share - 1);
      const added = await app(network, 0);

      expect(await trim(added, network)).toEqual({ evicted: 0, dropped: false });
      expect((await stored([...old, added])).size).toBe(share);
    });

    it("should drop the new app and keep the others when every other app is inside the grace period", async () => {
      const network = newNetwork();
      const young = await apps(network, minute, share);
      const added = await app(network, 0);

      expect(await trim(added, network)).toEqual({ evicted: 0, dropped: true });

      const left = await stored([...young, added]);
      expect(left.has(added)).toBe(false);
      expect(left.size).toBe(share);
    });

    it("should bring the share back to its cap when it was already over it with apps that cannot be evicted", async () => {
      const network = newNetwork();
      const young = await apps(network, minute, share);
      const old = await apps(network, hour, 5);
      const added = await app(network, 0);

      expect(await trim(added, network)).toEqual({ evicted: 5, dropped: true });
      expect([...(await stored([...young, ...old, added]))].sort()).toEqual([...young].sort());
    });

    it("should never evict the new app when its own registration is older than the grace period", async () => {
      const network = newNetwork();
      const old = await apps(network, 2 * hour, share);
      const added = await app(network, hour);

      expect(await trim(added, network)).toEqual({ evicted: 1, dropped: false });

      const left = await stored([...old, added]);
      expect(left.has(added)).toBe(true);
      expect(left.has(old.at(-1) ?? "")).toBe(false);
    });

    const exclusions: [string, (clientId: string) => Promise<void>][] = [
      ["holds only a refresh token", giveRefreshToken],
      ["holds only an access token", giveAccessToken],
      ["came from a metadata document", fromMetadataDocument],
      ["has no registration time", withoutRegistrationTime],
    ];

    it.each(exclusions)("should keep the oldest app and evict the next oldest when the oldest %s", async (_label, mark) => {
      const network = newNetwork();
      const old = await apps(network, hour, share);
      const [oldest = "", nextOldest = ""] = [...old].reverse();
      await mark(oldest);
      const added = await app(network, 0);

      expect(await trim(added, network)).toEqual({ evicted: 1, dropped: false });

      const left = await stored([...old, added]);
      expect(left.has(oldest)).toBe(true);
      expect(left.has(nextOldest)).toBe(false);
      expect(await shareSize(network)).toBe(share);
    });

    it("should count an approved app out of the share and never delete it when it is the oldest", async () => {
      const network = newNetwork();
      const old = await apps(network, hour, share);
      const oldest = old.at(-1) ?? "";
      await approve(oldest);
      const added = await app(network, 0);

      expect(await trim(added, network)).toEqual({ evicted: 0, dropped: false });
      expect((await stored([...old, added])).size).toBe(share + 1);
      expect(await shareSize(network)).toBe(share);
    });

    it("should leave apps alone when they are older than the window the cap counts", async () => {
      const network = newNetwork();
      const stale = await apps(network, (oauthLimits.unapprovedClientHours + 1) * hour, share);
      const old = await apps(network, hour, 10);
      const added = await app(network, 0);

      expect(await trim(added, network)).toEqual({ evicted: 0, dropped: false });
      expect((await stored([...stale, ...old, added])).size).toBe(share + 11);
    });

    it("should leave another network's apps and untagged apps alone when it trims a share", async () => {
      const network = newNetwork();
      const others = [...(await apps(newNetwork(), 2 * hour, share + 5)), ...(await apps(null, 2 * hour, 5))];
      await apps(network, hour, share);
      const added = await app(network, 0);

      expect((await trim(added, network)).evicted).toBe(1);
      expect((await stored(others)).size).toBe(others.length);
    });

    it("should leave the share at its cap and evict each old app once when many registrations trim at once", async () => {
      const network = newNetwork();
      const old = await apps(network, hour, share);
      const added = await apps(network, 0, 20);

      const results = await Promise.all(added.map((clientId) => trim(clientId, network)));

      expect(results.some((result) => result.dropped)).toBe(false);
      expect(results.reduce((sum, result) => sum + result.evicted, 0)).toBe(20);
      const left = await stored([...old, ...added]);
      expect(added.every((clientId) => left.has(clientId))).toBe(true);
      expect(old.slice(0, share - 20).every((clientId) => left.has(clientId))).toBe(true);
      expect(await shareSize(network)).toBe(share);
    });

    it("should never leave the share over its cap or delete an older app when many registrations race for the last places", async () => {
      const network = newNetwork();
      const young = await apps(network, minute, share - 5);
      const added = await apps(network, 0, 12);

      const results = await Promise.all(added.map((clientId) => trim(clientId, network)));

      expect(results.every((result) => result.evicted === 0)).toBe(true);
      const left = await stored([...young, ...added]);
      expect(young.every((clientId) => left.has(clientId))).toBe(true);
      const kept = added.filter((clientId) => left.has(clientId)).length;
      expect(kept).toBeLessThanOrEqual(5);
      expect(kept).toBe(results.filter((result) => !result.dropped).length);
      expect(await shareSize(network)).toBeLessThanOrEqual(share);
    });
  });

  describe("unapprovedClientCounts", () => {
    it("should count a network's unapproved apps, the ones a registration could evict, and the oldest inside the grace period", async () => {
      const network = newNetwork();
      await apps(network, hour, 3);
      const [, olderYoung = ""] = await apps(network, 5 * minute, 2);
      await giveRefreshToken(await app(network, hour));
      await giveAccessToken(await app(network, hour));
      await fromMetadataDocument(await app(network, hour));
      await approve(await app(network, hour));
      await apps(network, (oauthLimits.unapprovedClientHours + 1) * hour, 2);
      await apps(newNetwork(), hour, 4);

      const counts = await store.unapprovedClientCounts(network, now);

      expect(counts.fromNetwork).toBe(8);
      expect(counts.evictableFromNetwork).toBe(3);
      const [row] = await getDb().select({ createdAt: oauthClient.createdAt }).from(oauthClient).where(eq(oauthClient.clientId, olderYoung));
      expect(counts.oldestInGraceFromNetwork).toEqual(row?.createdAt);
      expect(counts.total).toBeGreaterThanOrEqual(12);
      expect(counts.evictable).toBeGreaterThanOrEqual(7);
    });

    it("should answer zero for a network with no apps", async () => {
      const counts = await store.unapprovedClientCounts(newNetwork(), now);
      expect(counts).toMatchObject({ fromNetwork: 0, evictableFromNetwork: 0, oldestInGraceFromNetwork: null });
    });

    it("should compare each token's client with the app being counted when it builds the query", () => {
      // An unqualified column there would compare the token's client with itself, and every app would seem to hold tokens.
      const { sql } = store.unapprovedClientCountsQuery("network", now).toSQL();
      expect(sql).toContain('r.client_id = "oauth_client"."client_id"');
      expect(sql).toContain('a.client_id = "oauth_client"."client_id"');
    });
  });

  describe("the registering network of an app", () => {
    it("should tag an app once and keep the first network when it is tagged again", async () => {
      const clientId = await app(null, minute);
      const network = newNetwork();

      await store.markClientNetwork(clientId, network);
      await store.markClientNetwork(clientId, newNetwork());
      await store.markClientNetwork(`${prefix}nobody`, network);

      expect(await tagOf(clientId)).toBe(network);
      expect(await shareSize(network)).toBe(1);
    });

    it("should forget the network of approved apps and of apps past the tag lifetime, and keep it for young unapproved ones", async () => {
      const network = newNetwork();
      const young = await app(network, hour);
      const youngest = await app(network, 0);
      const pastLifetime = await app(network, (oauthLimits.registeredNetworkHours + 1) * hour);
      const approved = await app(network, hour);
      await approve(approved);
      const undated = await app(network, hour);
      await withoutRegistrationTime(undated);

      expect(await store.clearRegisteredNetworks(now)).toBeGreaterThanOrEqual(3);

      expect(await Promise.all([young, youngest, pastLifetime, approved, undated].map(tagOf))).toEqual([network, network, null, null, null]);
    });

    it("should forget the network of an app as soon as it is approved and of no other app", async () => {
      const network = newNetwork();
      const approved = await app(network, hour);
      await approve(approved);
      const waiting = await app(network, hour);

      expect(await store.forgetApprovedClientNetworks(now)).toBeGreaterThanOrEqual(1);

      expect(await Promise.all([approved, waiting].map(tagOf))).toEqual([null, network]);
      expect(await store.forgetApprovedClientNetworks(now)).toBeGreaterThanOrEqual(0);
      expect(await tagOf(waiting)).toBe(network);
    });
  });

  describe("isStoredClient", () => {
    it("should tell a stored app from one that is not stored", async () => {
      const clientId = await app(null, hour);
      expect(await store.isStoredClient(clientId)).toBe(true);
      expect(await store.isStoredClient(`${prefix}missing`)).toBe(false);
      expect(await store.isStoredClient(`${clientId} `)).toBe(false);
    });
  });
});
