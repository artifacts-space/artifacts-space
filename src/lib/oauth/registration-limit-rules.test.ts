import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeDatabaseUrl } from "@/test/fake-database-url";

import { oauthLimits } from "./config";
import { registeredClientId, registrationPoolRefusal } from "./registration-limit-rules";

const nowMs = Date.parse("2026-11-12T12:00:00Z");
const perNetwork = oauthLimits.maxUnapprovedClientsPerNetwork;

describe("registrationPoolRefusal", () => {
  it("should let a registration through when the network and the pool have room", () => {
    expect(registrationPoolRefusal({ total: oauthLimits.maxUnapprovedClients - 1, fromNetwork: perNetwork - 1, oldestFromNetwork: null }, nowMs)).toBeNull();
  });

  it("should refuse with 429 until the network's oldest unapproved app leaves the window when the network holds its share", () => {
    const oldest = new Date(nowMs - 23 * 3_600_000);
    const refusal = registrationPoolRefusal({ total: perNetwork, fromNetwork: perNetwork, oldestFromNetwork: oldest }, nowMs);
    expect(refusal?.status).toBe(429);
    expect(refusal?.error).toBe("rate_limited");
    expect(refusal?.retryAfterSeconds).toBe(3600);
    expect(refusal?.description).toContain("nobody has approved yet");
  });

  it("should wait at least a minute when the oldest app is about to leave the window", () => {
    const oldest = new Date(nowMs - oauthLimits.unapprovedClientHours * 3_600_000 + 1000);
    expect(registrationPoolRefusal({ total: perNetwork, fromNetwork: perNetwork, oldestFromNetwork: oldest }, nowMs)?.retryAfterSeconds).toBe(60);
  });

  it("should refuse every network with 503 when the whole pool is full", () => {
    const refusal = registrationPoolRefusal({ total: oauthLimits.maxUnapprovedClients, fromNetwork: 0, oldestFromNetwork: null }, nowMs);
    expect(refusal).toMatchObject({ status: 503, error: "temporarily_unavailable", retryAfterSeconds: 3600 });
  });

  it("should need many networks to fill the pool when each holds its full share", () => {
    expect(oauthLimits.maxUnapprovedClients / perNetwork).toBeGreaterThanOrEqual(20);
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
