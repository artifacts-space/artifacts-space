import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimits, type RateLimitName } from "@/lib/abuse/limits";
import type * as RateLimitModule from "@/lib/abuse/rate-limit";
import { decideRateLimit, windowStart } from "@/lib/abuse/rate-limit-window";
import type { StoredCodeTrace, StoredRefreshGrant } from "@/lib/oauth/token-limit-rules";

/*
 * OAuth token limits on the auth route (registration and consent are in
 * route-oauth-registration-limits.test.ts). The Postgres counters are
 * replaced by an in-memory store that uses the real limits and the real
 * sliding-window decision, the code and refresh-token lookups by maps, and
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
  subjects: new Map<string, string[]>(),
  grants: new Map<string, StoredRefreshGrant>(),
  codes: new Map<string, StoredCodeTrace>(),
  clients: new Set<string>(),
  handler: vi.fn<(request: Request) => Promise<Response>>(),
  failCounters: false,
}));

vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ handler: store.handler }) }));
vi.mock("@/lib/oauth/limit-store", () => ({
  findRefreshGrant: (hash: string) => Promise.resolve(store.grants.get(hash) ?? null),
  findCodeTrace: (hash: string) => Promise.resolve(store.codes.get(hash) ?? { values: [], tokenClientIds: [] }),
  isStoredClient: (clientId: string) => {
    store.calls.push("lookup:client");
    return Promise.resolve(store.clients.has(clientId));
  },
}));
vi.mock("@/lib/abuse/rate-limit", async (importActual) => {
  const actual = await importActual<typeof RateLimitModule>();
  const guard = (label: string, subject = "") => {
    store.calls.push(label);
    store.subjects.set(label, [...(store.subjects.get(label) ?? []), subject]);
    if (store.failCounters) throw new Error("database down");
  };
  return {
    ...actual,
    hitRateLimits: (checks: readonly RateLimitModule.RateLimitCheck[]) => {
      for (const check of checks) {
        guard(`reserve:${check.name}`, check.subject);
        const decision = decide(check.name, check.subject);
        count(check.name, check.subject);
        if (!decision.allowed) return Promise.resolve({ name: check.name, retryAfterSeconds: decision.retryAfterSeconds });
      }
      return Promise.resolve(null);
    },
    hitRateLimit: (name: RateLimitName, subject: string) => {
      guard(`hit:${name}`, subject);
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

function code(value: string, clientId = "client-1") {
  store.codes.set(hashOAuthToken(value), { values: [JSON.stringify({ type: "authorization_code", query: { client_id: clientId } })], tokenClientIds: [] });
}

function exchange(value: string, clientId = "client-1", address?: string) {
  return tokenRequest({ grant_type: "authorization_code", code: value, code_verifier: "v", client_id: clientId }, address);
}

function grant(secret: string, userId: string, clientId = "client-1", state: Partial<StoredRefreshGrant> = {}) {
  store.grants.set(hashOAuthToken(secret), { userId, clientId, expiresAt: new Date(Date.now() + 86_400_000), revoked: null, rotationReplayExpiresAt: null, ...state });
}

function refreshAnswer(secret: string): Response {
  const row = store.grants.get(hashOAuthToken(secret));
  if (row && !row.revoked && row.expiresAt && row.expiresAt > new Date()) return Response.json({ access_token: "artifacts_oat_x", refresh_token: "artifacts_ort_next" });
  return Response.json({ error: "invalid_grant", error_description: "invalid refresh token" }, { status: 400 });
}

/** Better Auth's answers: a live token refreshes, a waiting code is used up, anything else is invalid_grant. */
async function betterAuth(request: Request): Promise<Response> {
  const body = new URLSearchParams(await request.text());
  if (body.get("grant_type") !== "authorization_code") return refreshAnswer(body.get("refresh_token")?.replace("artifacts_ort_", "") ?? "");
  const trace = store.codes.get(hashOAuthToken(body.get("code") ?? ""));
  if (!trace || trace.values.length === 0) return Response.json({ error: "invalid_grant", error_description: "invalid code" }, { status: 400 });
  store.codes.set(hashOAuthToken(body.get("code") ?? ""), { values: [], tokenClientIds: ["client-1"] });
  return Response.json({ access_token: "artifacts_oat_x" });
}

async function answer(response: Promise<Response>) {
  const settled = await response;
  return { status: settled.status, body: (await settled.json()) as Record<string, unknown>, retryAfter: settled.headers.get("retry-after") };
}

beforeEach(() => {
  counts.clear();
  store.calls.length = 0;
  store.subjects.clear();
  store.grants.clear();
  store.codes.clear();
  store.clients.clear();
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

  async function overFailureLimit(address?: string) {
    await failTimes(rateLimits.oauthTokenFailuresByNetwork.limit, address);
    store.handler.mockClear();
  }

  it("should count only the backstop when a valid code is exchanged", async () => {
    code("good-code");
    expect((await answer(exchange("good-code"))).status).toBe(200);
    expect(store.calls).toEqual(["hit:oauthToken"]);
  });

  it("should reserve a failure for the network on arrival when a code is unknown, and count nothing after", async () => {
    expect((await answer(exchange("bogus"))).status).toBe(400);
    expect(store.calls).toEqual(["hit:oauthToken", "reserve:oauthTokenFailuresByNetwork"]);
  });

  it("should treat a code issued to another client as unknown", async () => {
    code("their-code", "client-2");
    await exchange("their-code", "client-1");
    expect(store.calls).toContain("reserve:oauthTokenFailuresByNetwork");
  });

  it("should check and then count the connection when a usable refresh token succeeds", async () => {
    grant("good", "user-1");
    expect((await answer(refresh("good"))).status).toBe(200);
    expect(store.calls).toEqual(["hit:oauthToken", "peek:oauthRefreshByConnection", "count:oauthRefreshByConnection"]);
  });

  it("should reserve a failure for the network and nothing for any connection when the refresh token is unknown", async () => {
    expect((await answer(refresh("guess"))).status).toBe(400);
    expect(store.calls).toEqual(["hit:oauthToken", "reserve:oauthTokenFailuresByNetwork"]);
  });

  it("should count a failure for the network after the answer when Better Auth refuses a known token", async () => {
    grant("expired", "user-1", "client-1", { expiresAt: new Date(Date.now() - 1000) });
    expect((await answer(refresh("expired"))).status).toBe(400);
    expect(store.calls).toEqual(["hit:oauthToken", "count:oauthTokenFailuresByNetwork"]);
  });

  it("should treat someone's token as unknown when another client presents it", async () => {
    grant("good", "user-1", "client-1");
    await refresh("good", "client-2");
    expect(store.calls).not.toContain("peek:oauthRefreshByConnection");
    expect(store.calls).toContain("reserve:oauthTokenFailuresByNetwork");
  });

  it("should read the client from the Basic header before the body when both name one", async () => {
    grant("good", "user-1", "client-1");
    const basic = `Basic ${btoa("client-1:secret")}`;
    const response = await POST(new Request(`${site}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: "artifacts_ort_good", client_id: "client-2" }).toString(),
    }));
    expect(response.status).toBe(200);
    expect(store.calls).toEqual(["hit:oauthToken", "peek:oauthRefreshByConnection", "count:oauthRefreshByConnection"]);
  });

  it("should keep valid refreshes and code exchanges working from a network far over its failure limit", async () => {
    grant("good", "user-1");
    code("new-connection");
    await failTimes(3 * rateLimits.oauthTokenFailuresByNetwork.limit);

    expect((await answer(refresh("good"))).status).toBe(200);
    expect((await answer(exchange("new-connection"))).status).toBe(200);
  });

  it("should send a replayed rotated token, an expired one, and a used code to Better Auth when the network is over its failure limit", async () => {
    grant("rotated", "user-1", "client-1", { revoked: new Date(Date.now() - 600_000), rotationReplayExpiresAt: new Date(Date.now() - 570_000) });
    grant("expired", "user-2", "client-1", { expiresAt: new Date(Date.now() - 1000) });
    store.codes.set(hashOAuthToken("used"), { values: [], tokenClientIds: ["client-1"] });
    await overFailureLimit();

    for (const response of [refresh("rotated"), refresh("expired"), exchange("used")]) {
      expect(await answer(response)).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    }
    expect(store.handler).toHaveBeenCalledTimes(3);
  });

  it("should still send a refresh token and a code we no longer hold to Better Auth when the network is over its failure limit, so a dead connection hears invalid_grant", async () => {
    await overFailureLimit();

    for (let attempt = 0; attempt < 500; attempt += 1) {
      const gone = attempt % 2 === 0 ? refresh(`deleted-${String(attempt)}`) : exchange(`expired-and-deleted-${String(attempt)}`);
      expect(await answer(gone)).toMatchObject({ status: 400, body: { error: "invalid_grant" }, retryAfter: null });
    }
    expect(store.handler).toHaveBeenCalledTimes(500);
    expect(store.calls).not.toContain("lookup:client");
  });

  it("should send it on for a metadata-document app only when the app is stored, since Better Auth would fetch the document of one it does not hold", async () => {
    const stored = "https://assistant.example/oauth/metadata.json";
    const unseen = "https://unseen.example/oauth/metadata.json";
    store.clients.add(stored);
    await overFailureLimit();

    expect(await answer(refresh("deleted", stored))).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    expect(store.handler).toHaveBeenCalledOnce();

    const refused = await answer(refresh("deleted", unseen));
    expect(refused).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(Number(refused.retryAfter)).toBeGreaterThan(0);
    expect(store.handler).toHaveBeenCalledOnce();
  });

  it("should look up no client and fetch nothing while the network is under its failure limit", async () => {
    expect((await answer(refresh("deleted", "https://unseen.example/oauth/metadata.json"))).status).toBe(400);
    expect(store.calls).toEqual(["hit:oauthToken", "reserve:oauthTokenFailuresByNetwork"]);
  });

  it.each<[string, Record<string, string>, Record<string, string>]>([
    ["names no client", { grant_type: "refresh_token", refresh_token: "artifacts_ort_x" }, {}],
    ["carries no refresh token", { grant_type: "refresh_token", client_id: "client-1" }, {}],
    ["carries no code", { grant_type: "authorization_code", code_verifier: "v", client_id: "client-1" }, {}],
    ["asks for a grant type we do not give", { grant_type: "client_credentials", client_id: "client-1" }, {}],
    ["proves its client with an assertion", { grant_type: "refresh_token", refresh_token: "artifacts_ort_x", client_id: "client-1", client_assertion: "jwt", client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer" }, {}],
    ["sends an Authorization header that is not Basic", { grant_type: "refresh_token", refresh_token: "artifacts_ort_x", client_id: "client-1" }, { authorization: "Bearer abc" }],
  ])("should make a request wait over the failure limit, before Better Auth runs, when it %s", async (_label, body, headers) => {
    await overFailureLimit();

    const response = await POST(new Request(`${site}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.10", ...headers },
      body: new URLSearchParams(body).toString(),
    }));
    const refused = await answer(Promise.resolve(response));

    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe("rate_limited");
    expect(String(refused.body.error_description)).toContain("failed");
    expect(Number(refused.retryAfter)).toBeGreaterThan(0);
    expect(store.handler).not.toHaveBeenCalled();
  });

  it("should count every failure of a token someone holds, and keep sending it to Better Auth, when it is failed with over and over", async () => {
    grant("mine", "user-1");
    await overFailureLimit();
    store.calls.length = 0;
    store.handler.mockImplementation(() => Promise.resolve(Response.json({ error: "invalid_scope" }, { status: 400 })));

    for (let attempt = 0; attempt < 20; attempt += 1) expect((await answer(refresh("mine"))).status).toBe(400);

    expect(store.handler).toHaveBeenCalledTimes(20);
    expect(store.calls.filter((call) => call === "count:oauthTokenFailuresByNetwork")).toHaveLength(20);
  });

  it("should treat a token another client holds like a made-up one when the network is over its failure limit, and leave the answer to Better Auth", async () => {
    grant("theirs", "user-1", "client-2");
    await overFailureLimit();
    const checksFor = async (secret: string) => {
      store.calls.length = 0;
      await refresh(secret);
      return [...store.calls];
    };

    const theirs = await checksFor("theirs");
    const madeUp = await checksFor("made-up");

    expect(theirs).toEqual(madeUp);
    expect(theirs).toEqual(["hit:oauthToken", "reserve:oauthTokenFailuresByNetwork"]);
    expect(store.handler).toHaveBeenCalledTimes(2);
  });

  it("should leave other networks alone when one network is over its failure limit", async () => {
    await failTimes(rateLimits.oauthTokenFailuresByNetwork.limit);

    expect((await answer(refresh("guess-again", "client-1", "192.0.2.50"))).status).toBe(400);
  });

  it("should stop one looping connection at its limit while another connection from the same network goes on", async () => {
    grant("calm", "user-2");
    for (let attempt = 0; attempt <= rateLimits.oauthRefreshByConnection.limit; attempt += 1) grant(`loop-${String(attempt)}`, "user-1");
    for (let attempt = 0; attempt < rateLimits.oauthRefreshByConnection.limit; attempt += 1) expect((await answer(refresh(`loop-${String(attempt)}`))).status).toBe(200);

    const refused = await answer(refresh(`loop-${String(rateLimits.oauthRefreshByConnection.limit)}`));
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

describe("auth route OAuth limits by network", () => {
  const sameLine = ["2001:db8:1:1::a", "2001:db8:1:1:ffff:0:0:b"];
  const otherLine = "2001:db8:1:2::a";
  const ipv4Pair = ["203.0.113.10", "203.0.113.11"];

  /** The subject each address was counted under for `label`, in order. */
  async function subjectsFor(label: string, addresses: string[], send: (address: string) => Promise<Response>) {
    for (const address of addresses) await send(address);
    return store.subjects.get(label) ?? [];
  }

  const budgets: [string, (address: string) => Promise<Response>][] = [
    ["hit:oauthToken", (address) => refresh("guess", "client-1", address)],
    ["reserve:oauthTokenFailuresByNetwork", (address) => refresh("guess", "client-1", address)],
  ];

  it.each(budgets)("should share %s within one IPv6 /64 and not with another /64 or a second IPv4 address", async (label, send) => {
    grant("good", "user-1");
    const [first, second, third] = await subjectsFor(label, [...sameLine, otherLine], send);
    expect(first).toBe(second);
    expect(third).not.toBe(first);
    store.subjects.clear();
    const [v4a, v4b] = await subjectsFor(label, ipv4Pair, send);
    expect(v4a).not.toBe(v4b);
  });

  it("should make a request that names no client wait from a neighbour in the same /64 once the line is over its failure limit", async () => {
    for (let attempt = 0; attempt < rateLimits.oauthTokenFailuresByNetwork.limit; attempt += 1) await refresh(`guess-${String(attempt)}`, "client-1", sameLine[0]);
    const unnamed = (address: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: "artifacts_ort_next" }, address);

    expect((await unnamed(sameLine[1] ?? "")).status).toBe(429);
    expect((await unnamed(otherLine)).status).toBe(400);
  });
});

describe("auth route authorization limit", () => {
  it("should still count authorization requests per network and nothing else", async () => {
    store.handler.mockResolvedValueOnce(new Response(null, { status: 302 }));
    await GET(new Request(`${site}/api/auth/oauth2/authorize?client_id=c`, { headers: { "x-forwarded-for": "203.0.113.10" } }));
    expect(store.calls).toEqual(["hit:oauthAuthorize"]);
  });
});
