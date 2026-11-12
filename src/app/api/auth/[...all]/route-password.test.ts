import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimits, type RateLimitName } from "@/lib/abuse/limits";
import type * as RateLimitModule from "@/lib/abuse/rate-limit";
import { decideRateLimit, windowStart } from "@/lib/abuse/rate-limit-window";

/*
 * Password sign-in limits on the auth route. The Postgres counters are
 * replaced by an in-memory store that uses the real limits and the real
 * sliding-window decision, and Better Auth by a stub that knows one
 * reviewer's password, so every answer here is a real answer: who gets
 * refused, what they read, and that someone else's failures from their own
 * network never stop the reviewer.
 */

const counts = new Map<string, number>();

function bucket(name: RateLimitName, subject: string, nowMs: number) {
  const windowMs = rateLimits[name].windowSeconds * 1000;
  const current = windowStart(nowMs, windowMs);
  return { windowMs, key: (start: number) => `${name}:${subject}:${String(start)}`, current, previous: current - windowMs };
}

function decide(name: RateLimitName, subject: string, nowMs: number) {
  const { windowMs, key, current, previous } = bucket(name, subject, nowMs);
  return decideRateLimit({ previous: counts.get(key(previous)) ?? 0, current: counts.get(key(current)) ?? 0, nowMs, windowMs, limit: rateLimits[name].limit });
}

function count(name: RateLimitName, subject: string, nowMs: number) {
  const { key, current } = bucket(name, subject, nowMs);
  counts.set(key(current), (counts.get(key(current)) ?? 0) + 1);
}

const store = vi.hoisted(() => ({
  hitRateLimits: vi.fn<(checks: readonly { name: string; subject: string }[]) => Promise<unknown>>(),
  peekRateLimit: vi.fn<(name: string, subject: string) => Promise<unknown>>(),
  countRateLimitHit: vi.fn<(name: string, subject: string) => Promise<void>>(),
  handler: vi.fn<(request: Request) => Promise<Response>>(),
}));

vi.mock("@/lib/auth/server", () => ({ getAuth: () => ({ handler: store.handler }) }));
vi.mock("@/lib/oauth/clients", () => ({ countUnapprovedClients: () => Promise.resolve(0) }));
vi.mock("@/lib/abuse/rate-limit", async (importActual) => ({
  ...(await importActual<typeof RateLimitModule>()),
  hitRateLimit: vi.fn(),
  hitRateLimits: store.hitRateLimits,
  peekRateLimit: store.peekRateLimit,
  countRateLimitHit: store.countRateLimitHit,
}));

const { POST } = await import("./route");

const site = "https://artifacts.space";
const reviewer = "reviewer@artifacts.space";
const reviewerPassword = "the-reviewer-password-0123456789";

function signIn(email: string, password: string, address: string, contentType = "application/json") {
  const body = contentType === "application/json" ? JSON.stringify({ email, password }) : `email=${encodeURIComponent(email)}&password=${password}`;
  return POST(new Request(`${site}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": contentType, "x-forwarded-for": address }, body }));
}

async function answer(response: Promise<Response>) {
  const settled = await response;
  return { status: settled.status, body: await settled.text(), retryAfter: settled.headers.get("retry-after") };
}

describe("auth route password sign-in", () => {
  beforeEach(() => {
    counts.clear();
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    store.hitRateLimits.mockImplementation((checks) => {
      const nowMs = Date.now();
      const named = checks as readonly { name: RateLimitName; subject: string }[];
      const refused = named.map((check) => ({ check, decision: decide(check.name, check.subject, nowMs) })).find(({ decision }) => !decision.allowed);
      for (const check of named) count(check.name, check.subject, nowMs);
      return Promise.resolve(refused ? { name: refused.check.name, retryAfterSeconds: refused.decision.retryAfterSeconds } : null);
    });
    store.peekRateLimit.mockImplementation((name, subject) => Promise.resolve(decide(name as RateLimitName, subject, Date.now())));
    store.countRateLimitHit.mockImplementation((name, subject) => {
      count(name as RateLimitName, subject, Date.now());
      return Promise.resolve();
    });
    store.handler.mockImplementation(async (request) => {
      const { email, password } = (await request.json()) as { email: string; password: string };
      if (email === reviewer && password === reviewerPassword) return Response.json({ redirect: false, user: { email } });
      return Response.json({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }, { status: 401 });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should sign the reviewer in when the password is right", async () => {
    expect((await answer(signIn(reviewer, reviewerPassword, "203.0.113.9"))).status).toBe(200);
  });

  it("should never put the address or the network in a counter key", async () => {
    await signIn("Ada@Example.com", "wrong", "203.0.113.9");
    const keys = [...counts.keys()].join(" ");
    expect(keys).not.toContain("ada");
    expect(keys).not.toContain("203.0.113.9");
  });

  it("should refuse the 11th try for one address from one network within 15 minutes, without asking Better Auth", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) expect((await answer(signIn(reviewer, "wrong", "203.0.113.9"))).status).toBe(401);
    store.handler.mockClear();

    const refused = await answer(signIn(reviewer, reviewerPassword, "203.0.113.9"));

    expect(refused.status).toBe(429);
    expect(Number(refused.retryAfter)).toBeGreaterThan(0);
    expect(refused.body).toContain("You have tried to sign in to this email address a lot in the last few minutes.");
    expect(store.handler).not.toHaveBeenCalled();
  });

  it("should let the reviewer sign in from their network while someone else keeps failing from theirs", async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) await signIn(reviewer, `guess-${String(attempt)}`, `198.51.100.${String(attempt % 2)}`);

    expect((await answer(signIn(reviewer, reviewerPassword, "203.0.113.9"))).status).toBe(200);
  });

  it("should give the same refusal for an address with an account and one without when the network is over its limit", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) await signIn(`probe-${String(attempt)}@example.com`, "wrong", "192.0.2.4");

    // Each address is asked from the same counter state and moment: refused tries count too, so a second ask would wait longer.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now());
    const before = new Map(counts);
    const known = await answer(signIn(reviewer, "wrong", "192.0.2.4"));
    counts.clear();
    for (const [key, value] of before) counts.set(key, value);
    const unknown = await answer(signIn("nobody@example.com", "wrong", "192.0.2.4"));

    expect(known.status).toBe(429);
    expect(unknown).toEqual(known);
  });

  it("should count failures alike for known and unknown addresses and never count a success or a refusal", async () => {
    await signIn(reviewer, "wrong", "203.0.113.9");
    await signIn("nobody@example.com", "wrong", "203.0.113.9");
    await signIn(reviewer, reviewerPassword, "203.0.113.9");

    expect(store.countRateLimitHit.mock.calls.map(([name]) => name)).toEqual(["passwordSignInFailuresByEmail", "passwordSignInFailuresByEmail"]);
  });

  it("should treat one IPv6 /64 as one network so rotating addresses gets no fresh budget", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) await signIn(reviewer, "wrong", `2001:db8:1:2::${String(attempt + 1)}`);

    expect((await answer(signIn(reviewer, reviewerPassword, "2001:db8:1:2::ffff"))).status).toBe(429);
    expect((await answer(signIn(reviewer, reviewerPassword, "2001:db8:1:3::1"))).status).toBe(200);
  });

  it("should refuse every network once an address passes its daily failure ceiling", async () => {
    const ceiling = rateLimits.passwordSignInFailuresByEmail.limit;
    for (let attempt = 0; attempt < ceiling; attempt += 1) await signIn(reviewer, "wrong", `10.${String(Math.floor(attempt / 200))}.${String(Math.floor(attempt / 9) % 200)}.${String(attempt % 9)}`);

    const refused = await answer(signIn(reviewer, reviewerPassword, "203.0.113.9"));

    expect(refused.status).toBe(429);
    expect(refused.body).toContain("failed password sign-ins today");
  });

  it("should refuse a form post so the per-address limits cannot be skipped", async () => {
    expect((await answer(signIn(reviewer, reviewerPassword, "203.0.113.9", "application/x-www-form-urlencoded"))).status).toBe(415);
    expect(store.handler).not.toHaveBeenCalled();
  });

  it("should refuse rather than let the try through when the counters fail", async () => {
    store.hitRateLimits.mockRejectedValue(new Error("database down"));

    expect((await answer(signIn(reviewer, reviewerPassword, "203.0.113.9"))).status).toBe(503);
    expect(store.handler).not.toHaveBeenCalled();
  });
});
