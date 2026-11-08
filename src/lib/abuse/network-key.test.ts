import { afterEach, describe, expect, it, vi } from "vitest";

import { clientAddress, MissingNetworkKeySecretError, networkKey, networkKeySecret } from "./network-key";

describe("clientAddress", () => {
  it("should use the first forwarded address when a proxy chain is listed", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("should fall back to x-real-ip, then unknown, when forwarded-for is missing", () => {
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});

describe("networkKey", () => {
  it("should hash the address so it is never stored raw", () => {
    const key = networkKey(new Headers({ "x-real-ip": "198.51.100.2" }), "secret");
    expect(key).toMatch(/^[a-f0-9]{32}$/);
    expect(key).not.toContain("198");
  });

  it("should give different keys when the secret differs", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.2" });
    expect(networkKey(headers, "a")).not.toBe(networkKey(headers, "b"));
  });
});

describe("networkKeySecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should throw when BETTER_AUTH_SECRET is missing", () => {
    expect(() => networkKeySecret({})).toThrow(MissingNetworkKeySecretError);
  });

  it("should throw when BETTER_AUTH_SECRET is blank", () => {
    expect(() => networkKeySecret({ BETTER_AUTH_SECRET: "   " })).toThrow(MissingNetworkKeySecretError);
  });

  it("should return the secret when it is set", () => {
    expect(networkKeySecret({ BETTER_AUTH_SECRET: "s3cret" })).toBe("s3cret");
  });

  it("should refuse to hash with an empty secret when the environment has none", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    expect(() => networkKey(new Headers({ "x-real-ip": "198.51.100.2" }))).toThrow(MissingNetworkKeySecretError);
    expect(() => networkKey(new Headers({ "x-real-ip": "198.51.100.2" }), "")).toThrow(MissingNetworkKeySecretError);
  });

  it("should hash with the environment secret when none is passed", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "from-env");
    const headers = new Headers({ "x-real-ip": "198.51.100.2" });
    expect(networkKey(headers)).toBe(networkKey(headers, "from-env"));
  });
});

describe("network-key module", () => {
  it("should load without a secret so the build needs none", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.resetModules();
    await expect(import("./network-key")).resolves.toHaveProperty("networkKey");
    vi.unstubAllEnvs();
  });
});
