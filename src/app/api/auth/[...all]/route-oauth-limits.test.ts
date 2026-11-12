import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimits, type RateLimitName } from "@/lib/abuse/limits";
import type * as RateLimitModule from "@/lib/abuse/rate-limit";
import { decideRateLimit, windowStart } from "@/lib/abuse/rate-limit-window";
import type { StoredCodeGrant, StoredRefreshGrant } from "@/lib/oauth/token-limit-rules";

/*
 * OAuth token and registration limits on the auth route. The Postgres
 * counters are replaced by an in-memory store that uses the real limits and
 * the real sliding-window decision, the refresh-token lookup by a map, and
 * Better Auth by a stub, so these show which checks run for which request
 * and what is counted after the answer. The same flows against a real
 * database are in route-oauth-limits.db.test.ts.
 */

const counts = new Map<string, number>();

function bucket(name: RateLimitName, subject: string, nowMs: number) {
  const windowMs = rateLimits[name].windowSeconds * 1000;
  const current = windowStart(nowMs, windowMs);
  return { windowMs, key: (start: number) => `${name}:${subject}:${String(start)}`, current, previous: current - windowMs };
}

function decide(name: RateLimitName, subject: string, nowMs = Date.now()) {
  const { windowMs, key, current, previous } = bucket(name, subject, nowMs);
  return decideRateLimit({ previous: counts.get(key(previous)) ?? 0, current: counts.get(key(current)) ?? 0, nowMs, windowMs, limit: rateLimits[name].limit });
}

function count(name: RateLimitName, subject: string, nowMs = Date.now()) {
  const { key, current } = bucket(name, subject, nowMs);
  counts.set(key(current), (counts.get(key(current)) ?? 0) + 1);
}

const store = vi.hoisted(() => ({
  calls: [] as string[],
  grants: new Map<string, StoredRefreshGrant>(),
  codes: new Map<string, StoredCodeGrant>(),
  pool: { total: 0, fromNetwork: 0, evictedFromNetwork: 0, oldestFromNetwork: null as Date | null, evictable: 0, oldestInGrace: null as Date | null },
  evict: [] as { clientId: string; network: string | null }[],
  overCap: false,
  marked: [] as { clientId: string; network: string }[],
  handler: vi.fn<(request: Request) => Promise<Response>>(),
  failCounters: false,
}));

vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ handler: store.handler }) }));
vi.mock("@/lib/oauth/limit-store", () => ({
  findRefreshGrant: (hash: string) => Promise.resolve(store.grants.get(hash) ?? null),
  findCodeGrant: (hash: string) => Promise.resolve(store.codes.get(hash) ?? null),
  unapprovedClientCounts: () => Promise.resolve(store.pool),
  evictOldestUnapproved: () => Promise.resolve(store.evict),
  dropIfPoolOverCap: () => Promise.resolve(store.overCap),
  markClientNetwork: (clientId: string, network: string) => {
    store.marked.push({ clientId, network });
    return Promise.resolve();
  },
}));
vi.mock("@/lib/abuse/rate-limit", async (importActual) => {
  const actual = await importActual<typeof RateLimitModule>();
  const guard = (label: string) => {
    store.calls.push(label);
    if (store.failCounters) throw new Error("database down");
  };
  return {
    ...actual,
    hitRateLimits: vi.fn(),
    hitRateLimit: (name: RateLimitName, subject: string) => {
      guard(`hit:${name}`);
      const decision = decide(name, subject);
      if (decision.allowed) count(name, subject);
      return Promise.resolve(decision);
    },
    peekRateLimit: (name: RateLimitName, subject: string) => {
      guard(`peek:${name}`);
      return Promise.resolve(decide(name, subject));
    },
    countRateLimitHit: (name: RateLimitName, subject: string) => {
      guard(`count:${name}`);
      count(name, subject);
      return Promise.resolve();
    },
  };
});

const { hashOAuthToken } = await import("@/lib/oauth/config");
const { GET, POST } = await import("./route");

const site = "https://artifacts.space";

function tokenRequest(body: Record<string, string>, address = "203.0.113.10") {
  return POST(new Request(`${site}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": address },
    body: new URLSearchParams(body).toString(),
  }));
}

function refresh(secret: string, clientId = "client-1", address?: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: `artifacts_ort_${secret}`, client_id: clientId }, address);
}

function register(address = "198.51.100.20") {
  return POST(new Request(`${site}/api/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": address },
    body: JSON.stringify({ client_name: "App", redirect_uris: ["https://app.example/callback"] }),
  }));
}

function code(value: string, clientId = "client-1") {
  store.codes.set(hashOAuthToken(value), { value: JSON.stringify({ type: "authorization_code", query: { client_id: clientId } }), expiresAt: new Date(Date.now() + 600_000) });
}

function exchange(value: string, clientId = "client-1", address?: string) {
  return tokenRequest({ grant_type: "authorization_code", code: value, code_verifier: "v", client_id: clientId }, address);
}

function grant(secret: string, userId: string, clientId = "client-1") {
  store.grants.set(hashOAuthToken(secret), { userId, clientId, expiresAt: new Date(Date.now() + 86_400_000), revoked: null, rotationReplayExpiresAt: null });
}

/** Better Auth's answers: a known token refreshes, anything else is invalid_grant. */
async function betterAuth(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path.endsWith("/register")) return Response.json({ client_id: "new-client" }, { status: 201 });
  const body = new URLSearchParams(await request.text());
  if (body.get("grant_type") === "authorization_code") {
    if (store.codes.has(hashOAuthToken(body.get("code") ?? ""))) return Response.json({ access_token: "artifacts_oat_x" });
    return Response.json({ error: "invalid_grant", error_description: "invalid code" }, { status: 400 });
  }
  const secret = body.get("refresh_token")?.replace("artifacts_ort_", "") ?? "";
  if (store.grants.has(hashOAuthToken(secret))) return Response.json({ access_token: "artifacts_oat_x", refresh_token: "artifacts_ort_next" });
  return Response.json({ error: "invalid_grant", error_description: "invalid refresh token" }, { status: 400 });
}

async function answer(response: Promise<Response>) {
  const settled = await response;
  return { status: settled.status, body: (await settled.json()) as Record<string, unknown>, retryAfter: settled.headers.get("retry-after") };
}

beforeEach(() => {
  counts.clear();
  store.calls.length = 0;
  store.grants.clear();
  store.codes.clear();
  store.marked.length = 0;
  store.pool = { total: 0, fromNetwork: 0, evictedFromNetwork: 0, oldestFromNetwork: null, evictable: 0, oldestInGrace: null };
  store.evict = [];
  store.overCap = false;
  store.failCounters = false;
  store.handler.mockReset();
  store.handler.mockImplementation(betterAuth);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("auth route token limits", () => {
  async function failTimes(count: number, address?: string) {
    for (let attempt = 0; attempt < count; attempt += 1) {
      if (attempt % 2 === 0) await refresh(`guess-${String(attempt)}`, "client-1", address);
      else await exchange(`bogus-${String(attempt)}`, "client-1", address);
    }
  }

  it("should count the backstop and nothing else before Better Auth when a valid code is exchanged", async () => {
    code("good-code");
    expect((await answer(exchange("good-code"))).status).toBe(200);
    expect(store.calls).toEqual(["hit:oauthToken"]);
  });

  it("should check the network's failures when a code is not valid now", async () => {
    expect((await answer(exchange("bogus"))).status).toBe(400);
    expect(store.calls).toEqual(["hit:oauthToken", "peek:oauthTokenFailuresByNetwork", "count:oauthTokenFailuresByNetwork"]);
  });

  it("should treat a code issued to another client as not valid", async () => {
    code("their-code", "client-2");
    await exchange("their-code", "client-1");
    expect(store.calls).toContain("peek:oauthTokenFailuresByNetwork");
  });

  it("should check and then count the connection when a usable refresh token succeeds", async () => {
    grant("good", "user-1");
    expect((await answer(refresh("good"))).status).toBe(200);
    expect(store.calls).toEqual(["hit:oauthToken", "peek:oauthRefreshByConnection", "count:oauthRefreshByConnection"]);
  });

  it("should count a failure for the network and nothing for any connection when the refresh token is wrong", async () => {
    expect((await answer(refresh("guess"))).status).toBe(400);
    expect(store.calls).toEqual(["hit:oauthToken", "peek:oauthTokenFailuresByNetwork", "count:oauthTokenFailuresByNetwork"]);
  });

  it("should skip the connection check when another client presents someone's token", async () => {
    grant("good", "user-1", "client-1");
    store.handler.mockResolvedValueOnce(Response.json({ error: "invalid_grant" }, { status: 400 }));
    await refresh("good", "client-2");
    expect(store.calls).not.toContain("peek:oauthRefreshByConnection");
    expect(store.calls).toContain("count:oauthTokenFailuresByNetwork");
  });

  it("should keep valid refreshes and code exchanges working from a network far over its failure limit", async () => {
    grant("good", "user-1");
    code("new-connection");
    await failTimes(3 * rateLimits.oauthTokenFailuresByNetwork.limit);

    expect((await answer(refresh("good"))).status).toBe(200);
    expect((await answer(exchange("new-connection"))).status).toBe(200);
  });

  it("should refuse requests without a valid credential over the failure limit, before Better Auth runs", async () => {
    await failTimes(rateLimits.oauthTokenFailuresByNetwork.limit);
    store.handler.mockClear();

    const badRefresh = await answer(refresh("still-guessing"));
    const badCode = await answer(exchange("still-bogus"));

    for (const refused of [badRefresh, badCode]) {
      expect(refused.status).toBe(429);
      expect(refused.body.error).toBe("rate_limited");
      expect(String(refused.body.error_description)).toContain("failed");
      expect(Number(refused.retryAfter)).toBeGreaterThan(0);
    }
    expect(store.handler).not.toHaveBeenCalled();
  });

  it("should give every made-up credential the same refusal when the network is over its failure limit", async () => {
    grant("rotated", "user-1");
    const stored = store.grants.get(hashOAuthToken("rotated"));
    if (stored) stored.revoked = new Date(Date.now() - 600_000);
    await failTimes(rateLimits.oauthTokenFailuresByNetwork.limit);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now());

    const rotated = await answer(refresh("rotated"));
    const madeUp = await answer(refresh("made-up"));

    vi.useRealTimers();
    expect(rotated).toEqual(madeUp);
  });

  it("should leave other networks alone when one network is over its failure limit", async () => {
    await failTimes(rateLimits.oauthTokenFailuresByNetwork.limit);

    expect((await answer(refresh("guess-again", "client-1", "192.0.2.50"))).status).toBe(400);
  });

  it("should stop one looping connection at its limit while another connection from the same network goes on", async () => {
    grant("loop", "user-1");
    grant("calm", "user-2");
    for (let attempt = 0; attempt < rateLimits.oauthRefreshByConnection.limit; attempt += 1) expect((await answer(refresh("loop"))).status).toBe(200);

    const refused = await answer(refresh("loop"));
    expect(refused.status).toBe(429);
    expect(String(refused.body.error_description)).toContain("This connection");
    expect((await answer(refresh("calm"))).status).toBe(200);
  });

  it("should let the request through uncounted when the counters fail", async () => {
    grant("good", "user-1");
    store.failCounters = true;
    expect((await answer(refresh("good"))).status).toBe(200);
    expect(store.handler).toHaveBeenCalledOnce();
  });

  it("should apply the limits to a token path with a trailing slash", async () => {
    await POST(new Request(`${site}/api/auth/oauth2/token/`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=authorization_code" }));
    expect(store.calls[0]).toBe("hit:oauthToken");
  });
});

describe("auth route registration limits", () => {
  it("should count the hourly limit and tag the new app with the network when registration succeeds", async () => {
    const response = await answer(register());
    expect(response.status).toBe(201);
    expect(store.calls).toEqual(["hit:oauthRegister"]);
    expect(store.marked).toHaveLength(1);
    expect(store.marked[0]?.clientId).toBe("new-client");
    expect(store.marked[0]?.network).not.toContain("198.51.100.20");
  });

  it("should not tag anything when Better Auth refuses the registration", async () => {
    store.handler.mockResolvedValueOnce(Response.json({ error: "invalid_client_metadata" }, { status: 400 }));
    await register();
    expect(store.marked).toHaveLength(0);
  });

  it("should refuse with 429 and Retry-After when the network holds its share of unapproved apps", async () => {
    store.pool = { ...store.pool, total: 100, fromNetwork: 100, oldestFromNetwork: new Date(Date.now() - 23 * 3_600_000) };
    const refused = await answer(register());
    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe("rate_limited");
    expect(Number(refused.retryAfter)).toBeGreaterThan(3000);
    expect(store.handler).not.toHaveBeenCalled();
  });

  it("should refuse with 503 and Retry-After when the whole pool is full of apps inside the grace period", async () => {
    store.pool = { ...store.pool, total: 2000, oldestInGrace: new Date(Date.now() - 60_000) };
    const refused = await answer(register());
    expect(refused.status).toBe(503);
    expect(Number(refused.retryAfter)).toBeLessThanOrEqual(15 * 60);
    expect(store.handler).not.toHaveBeenCalled();
  });

  it("should register and count the evicted app against its own network when the full pool makes room", async () => {
    store.pool = { ...store.pool, total: 2000, evictable: 5 };
    store.evict = [{ clientId: "old-client", network: "other-network" }];
    expect((await answer(register())).status).toBe(201);
    expect(store.calls).toEqual(["hit:oauthRegister", "count:oauthEvictedByNetwork"]);
  });

  it("should answer 503 instead when nothing could be evicted and the new app was dropped", async () => {
    store.pool = { ...store.pool, total: 2000, evictable: 1 };
    store.overCap = true;
    const refused = await answer(register());
    expect(refused.status).toBe(503);
    expect(refused.body.error).toBe("temporarily_unavailable");
    expect(Number(refused.retryAfter)).toBeGreaterThan(0);
  });

  it("should refuse at the hourly limit with the OAuth error shape", async () => {
    for (let attempt = 0; attempt < rateLimits.oauthRegister.limit; attempt += 1) await register();
    const refused = await answer(register());
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ error: "rate_limited" });
    expect(Number(refused.retryAfter)).toBeGreaterThan(0);
  });

  it("should let the registration through when the counters fail", async () => {
    store.failCounters = true;
    expect((await answer(register())).status).toBe(201);
  });
});

describe("auth route authorization limit", () => {
  it("should still count authorization requests per network and nothing else", async () => {
    store.handler.mockResolvedValueOnce(new Response(null, { status: 302 }));
    await GET(new Request(`${site}/api/auth/oauth2/authorize?client_id=c`, { headers: { "x-forwarded-for": "203.0.113.10" } }));
    expect(store.calls).toEqual(["hit:oauthAuthorize"]);
  });
});
