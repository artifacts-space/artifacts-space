import { afterEach, describe, expect, it, vi } from "vitest";

import { rateLimits } from "@/lib/abuse/limits";
import { fakeDatabaseUrl } from "@/test/fake-database-url";

import { oauthLimits } from "./config";
import { graceWait, registeredClientId, registrationPoolRefusal, type UnapprovedClientCounts } from "./registration-limit-rules";

const nowMs = Date.parse("2026-11-12T12:00:00Z");
const perNetwork = oauthLimits.maxUnapprovedClientsPerNetwork;

const counts = (overrides: Partial<UnapprovedClientCounts>): UnapprovedClientCounts => ({
  total: 0,
  fromNetwork: 0,
  evictedFromNetwork: 0,
  oldestFromNetwork: null,
  evictable: 0,
  oldestInGrace: null,
  ...overrides,
});
const pool = oauthLimits.maxUnapprovedClients;
const graceSeconds = oauthLimits.unapprovedEvictionGraceMinutes * 60;

describe("registrationPoolRefusal", () => {
  it("should let a registration through when the network and the pool have room", () => {
    expect(registrationPoolRefusal(counts({ total: pool - 1, fromNetwork: perNetwork - 1 }), nowMs)).toBeNull();
  });

  it("should refuse with 429 until the network's oldest unapproved app leaves the window when the network holds its share", () => {
    const oldest = new Date(nowMs - 23 * 3_600_000);
    const refusal = registrationPoolRefusal(counts({ total: perNetwork, fromNetwork: perNetwork, oldestFromNetwork: oldest }), nowMs);
    expect(refusal?.status).toBe(429);
    expect(refusal?.error).toBe("rate_limited");
    expect(refusal?.retryAfterSeconds).toBe(3600);
    expect(refusal?.description).toContain("nobody has approved yet");
  });

  it("should keep counting a network's evicted apps toward its share when the pool made room by evicting them", () => {
    expect(registrationPoolRefusal(counts({ total: 10, fromNetwork: 10, evictedFromNetwork: perNetwork - 10 }), nowMs)?.status).toBe(429);
    expect(registrationPoolRefusal(counts({ total: 10, fromNetwork: 10, evictedFromNetwork: perNetwork - 11 }), nowMs)).toBeNull();
  });

  it("should wait at least a minute when the oldest app is about to leave the window", () => {
    const oldest = new Date(nowMs - oauthLimits.unapprovedClientHours * 3_600_000 + 1000);
    expect(registrationPoolRefusal(counts({ total: perNetwork, fromNetwork: perNetwork, oldestFromNetwork: oldest }), nowMs)?.retryAfterSeconds).toBe(60);
  });

  it("should let a registration through to evict when the pool is full but holds an app past the grace period", () => {
    expect(registrationPoolRefusal(counts({ total: pool, evictable: 1 }), nowMs)).toBeNull();
  });

  it("should refuse every network with 503 until the oldest app leaves the grace period when the full pool holds only newer apps", () => {
    const refusal = registrationPoolRefusal(counts({ total: pool, oldestInGrace: new Date(nowMs - 5 * 60_000) }), nowMs);
    expect(refusal).toMatchObject({ status: 503, error: "temporarily_unavailable" });
    expect(refusal?.retryAfterSeconds).toBe(graceSeconds - 5 * 60);
  });

  it("should keep the full-pool wait between a minute and the grace period", () => {
    expect(graceWait(new Date(nowMs - graceSeconds * 1000 + 500), nowMs)).toBe(60);
    expect(graceWait(new Date(nowMs + 3_600_000), nowMs)).toBe(graceSeconds);
    expect(graceWait(null, nowMs)).toBe(graceSeconds);
  });

  it("should need many networks to fill the pool when each holds its full share", () => {
    expect(oauthLimits.maxUnapprovedClients / perNetwork).toBeGreaterThanOrEqual(20);
  });

  it("should count evictions over the same day and share as the per-network cap", () => {
    expect(rateLimits.oauthEvictedByNetwork.limit).toBe(perNetwork);
    expect(rateLimits.oauthEvictedByNetwork.windowSeconds).toBe(oauthLimits.unapprovedClientHours * 3600);
  });
});

describe("registeredClientId", () => {
  it("should read the client id when Better Auth answers a registration", () => {
    expect(registeredClientId({ client_id: "abc", client_name: "App" })).toBe("abc");
  });

  it("should find nothing when the answer has no client id", () => {
    expect(registeredClientId({ error: "invalid_client_metadata" })).toBeNull();
    expect(registeredClientId(null)).toBeNull();
    expect(registeredClientId({ client_id: "" })).toBeNull();
  });
});

describe("unapprovedClientCountsQuery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should tie each consent to its own app and count the network's apps by its key", async () => {
    vi.stubEnv("DATABASE_URL", fakeDatabaseUrl());
    const { unapprovedClientCountsQuery } = await import("./limit-store");
    const { sql, params } = unapprovedClientCountsQuery("net-key").toSQL();
    expect(sql).toContain('"oauth_consent"."client_id" = "oauth_client"."client_id"');
    expect(sql).toContain('filter (where "oauth_client"."registered_network" = $');
    expect(params).toContain("net-key");
  });
});
