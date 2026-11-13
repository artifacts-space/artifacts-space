import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimits, type RateLimitName } from "@/lib/abuse/limits";
import type * as RateLimitModule from "@/lib/abuse/rate-limit";
import { decideRateLimit, windowStart } from "@/lib/abuse/rate-limit-window";
import type { EvictionScope } from "@/lib/oauth/limit-store";
import type { UnapprovedClientCounts } from "@/lib/oauth/registration-limit-rules";

/*
 * OAuth registration limits and the consent decision on the auth route. The
 * Postgres counter is replaced by an in-memory one that uses the real limit
 * and the real sliding-window decision, the app store by a recorder, and
 * Better Auth by a stub, so these show which checks run and what is tagged
 * and trimmed after the answer. The same flows against a real database are
 * in route-oauth-registration-limits.db.test.ts, and the token endpoint's
 * limits in route-oauth-limits.test.ts.
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

const emptyPool: UnapprovedClientCounts = { total: 0, evictable: 0, oldestInGrace: null, fromNetwork: 0, evictableFromNetwork: 0, oldestInGraceFromNetwork: null };

const store = vi.hoisted(() => ({
  calls: [] as string[],
  subjects: [] as string[],
  pool: null as UnapprovedClientCounts | null,
  evicted: [] as EvictionScope["kind"][],
  overCap: new Set<EvictionScope["kind"]>(),
  marked: [] as { clientId: string; network: string }[],
  forgotten: 0,
  handler: vi.fn<(request: Request) => Promise<Response>>(),
  failCounters: false,
}));

vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ handler: store.handler }) }));
vi.mock("@/lib/oauth/limit-store", () => ({
  unapprovedClientCounts: () => Promise.resolve(store.pool),
  trimUnapproved: (_clientId: string, scope: EvictionScope) => {
    store.evicted.push(scope.kind);
    return Promise.resolve({ evicted: 0, dropped: store.overCap.has(scope.kind) });
  },
  forgetApprovedClientNetworks: () => {
    store.forgotten += 1;
    return Promise.resolve(0);
  },
  markClientNetwork: (clientId: string, network: string) => {
    store.marked.push({ clientId, network });
    return Promise.resolve();
  },
}));
vi.mock("@/lib/abuse/rate-limit", async (importActual) => ({
  ...(await importActual<typeof RateLimitModule>()),
  hitRateLimit: (name: RateLimitName, subject: string) => {
    store.calls.push(`hit:${name}`);
    store.subjects.push(subject);
    if (store.failCounters) throw new Error("database down");
    const decision = decide(name, subject);
    const { key, current } = bucket(name, subject, Date.now());
    if (decision.allowed) counts.set(key(current), (counts.get(key(current)) ?? 0) + 1);
    return Promise.resolve(decision);
  },
}));

const { POST } = await import("./route");

const site = "https://artifacts.space";

function register(address = "198.51.100.20") {
  return POST(new Request(`${site}/api/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": address },
    body: JSON.stringify({ client_name: "App", redirect_uris: ["https://app.example/callback"] }),
  }));
}

async function answer(response: Promise<Response>) {
  const settled = await response;
  return { status: settled.status, body: (await settled.json()) as Record<string, unknown>, retryAfter: settled.headers.get("retry-after") };
}

beforeEach(() => {
  counts.clear();
  store.calls.length = 0;
  store.subjects.length = 0;
  store.marked.length = 0;
  store.pool = emptyPool;
  store.evicted.length = 0;
  store.overCap.clear();
  store.forgotten = 0;
  store.failCounters = false;
  store.handler.mockReset();
  store.handler.mockImplementation(() => Promise.resolve(Response.json({ client_id: "new-client" }, { status: 201 })));
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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

  it.each([200, 201, 202])("should tag and trim the new app when Better Auth answers %i with a client id", async (status) => {
    store.handler.mockResolvedValueOnce(Response.json({ client_id: "new-client" }, { status }));
    const response = await answer(register());
    expect(response.status).toBe(status);
    expect(store.marked.map((mark) => mark.clientId)).toEqual(["new-client"]);
    expect(store.evicted).toEqual(["network", "pool"]);
  });

  it("should drop the new app over the cap when the success answer is not a 201", async () => {
    store.handler.mockResolvedValueOnce(Response.json({ client_id: "new-client" }, { status: 200 }));
    store.overCap.add("network");
    expect((await answer(register())).status).toBe(429);
  });

  it("should send Better Auth's answer and log once when a success names no client", async () => {
    store.handler.mockResolvedValueOnce(Response.json({ ok: true }, { status: 201 }));
    const response = await answer(register());
    expect(response).toMatchObject({ status: 201, body: { ok: true } });
    expect(store.marked).toHaveLength(0);
    expect(store.evicted).toHaveLength(0);
    expect(console.error).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("named no client"), 201);
  });

  it("should send Better Auth's answer when a success body is not JSON", async () => {
    store.handler.mockResolvedValueOnce(new Response("created", { status: 201 }));
    const response = await register();
    expect(response.status).toBe(201);
    expect(await response.text()).toBe("created");
    expect(store.marked).toHaveLength(0);
  });

  it("should refuse with 429 and Retry-After when the network's full share holds only apps inside the grace period", async () => {
    store.pool = { ...emptyPool, total: 100, fromNetwork: 100, oldestInGraceFromNetwork: new Date(Date.now() - 60_000) };
    const refused = await answer(register());
    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe("rate_limited");
    expect(Number(refused.retryAfter)).toBeLessThanOrEqual(15 * 60);
    expect(store.handler).not.toHaveBeenCalled();
  });

  it("should register and trim the network's share and then the pool when the network's share is full of older apps", async () => {
    store.pool = { ...emptyPool, total: 100, fromNetwork: 100, evictableFromNetwork: 100 };
    expect((await answer(register())).status).toBe(201);
    expect(store.evicted).toEqual(["network", "pool"]);
  });

  it("should refuse with 503 and Retry-After when the whole pool is full of apps inside the grace period", async () => {
    store.pool = { ...emptyPool, total: 2000, oldestInGrace: new Date(Date.now() - 60_000) };
    const refused = await answer(register());
    expect(refused.status).toBe(503);
    expect(Number(refused.retryAfter)).toBeLessThanOrEqual(15 * 60);
    expect(store.handler).not.toHaveBeenCalled();
  });

  it("should answer 429 when the network's share stayed over the cap and the new app was dropped", async () => {
    store.overCap.add("network");
    const refused = await answer(register());
    expect(refused).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(store.evicted).toEqual(["network"]);
  });

  it("should answer 503 when the pool stayed over the cap and the new app was dropped", async () => {
    store.overCap.add("pool");
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

describe("auth route registration limits by network", () => {
  const sameLine = ["2001:db8:1:1::a", "2001:db8:1:1:ffff:0:0:b"];
  const otherLine = "2001:db8:1:2::a";
  const ipv4Pair = ["203.0.113.10", "203.0.113.11"];

  it("should share the hourly limit within one IPv6 /64 and not with another /64 or a second IPv4 address", async () => {
    for (const address of [...sameLine, otherLine, ...ipv4Pair]) await register(address);
    const [first, second, third, v4a, v4b] = store.subjects;
    expect(first).toBe(second);
    expect(third).not.toBe(first);
    expect(v4a).not.toBe(v4b);
  });

  it("should tag apps registered from one IPv6 /64 with one network, so they share the cap on unapproved apps", async () => {
    for (const address of [...sameLine, otherLine, ...ipv4Pair]) await register(address);
    const [first, second, third, v4a, v4b] = store.marked.map((mark) => mark.network);
    expect(first).toBe(second);
    expect(third).not.toBe(first);
    expect(v4a).not.toBe(v4b);
  });
});

describe("auth route consent", () => {
  function decide(status = 200) {
    store.handler.mockResolvedValueOnce(Response.json({}, { status }));
    return POST(new Request(`${site}/api/auth/oauth2/consent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accept: true }) }));
  }

  it("should forget the registering network of approved apps when a consent decision succeeds", async () => {
    expect((await decide()).status).toBe(200);
    expect(store.forgotten).toBe(1);
  });

  it("should forget nothing when Better Auth refuses the decision", async () => {
    expect((await decide(401)).status).toBe(401);
    expect(store.forgotten).toBe(0);
  });
});
