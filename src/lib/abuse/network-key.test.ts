import { afterEach, describe, expect, it, vi } from "vitest";

import { addressPrefix, clientAddress, MissingNetworkKeySecretError, networkKey, networkKeySecret, networkPrefixKey } from "./network-key";

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

describe("addressPrefix", () => {
  it("should keep an IPv4 address and unwrap an IPv4-mapped IPv6 one", () => {
    expect(addressPrefix("203.0.113.7")).toBe("203.0.113.7");
    expect(addressPrefix("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("should give every address in one IPv6 /64 the same prefix, however it is written", () => {
    const prefix = "2001:0db8:0001:0002::/64";
    expect(addressPrefix("2001:db8:1:2::1")).toBe(prefix);
    expect(addressPrefix("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(prefix);
    expect(addressPrefix("[2001:DB8:1:2::ffff]")).toBe(prefix);
    expect(addressPrefix("2001:db8:1:2::1%eth0")).toBe(prefix);
  });

  it("should give the next /64 a different prefix", () => {
    expect(addressPrefix("2001:db8:1:3::1")).not.toBe(addressPrefix("2001:db8:1:2::1"));
  });

  it("should leave anything that is not an address unchanged", () => {
    expect(addressPrefix("unknown")).toBe("unknown");
    expect(addressPrefix("1:2:3")).toBe("1:2:3");
    expect(addressPrefix("1::2::3")).toBe("1::2::3");
  });
});

describe("networkPrefixKey", () => {
  const headers = (address: string) => new Headers({ "x-forwarded-for": address });

  it("should key two addresses in one IPv6 /64 the same and keep them apart in networkKey", () => {
    expect(networkPrefixKey(headers("2001:db8::1"), "s")).toBe(networkPrefixKey(headers("2001:db8::2"), "s"));
    expect(networkKey(headers("2001:db8::1"), "s")).not.toBe(networkKey(headers("2001:db8::2"), "s"));
  });

  it("should key different IPv4 addresses apart and never show the address", () => {
    const key = networkPrefixKey(headers("203.0.113.7"), "s");
    expect(key).not.toBe(networkPrefixKey(headers("203.0.113.8"), "s"));
    expect(key).not.toContain("203");
  });

  it("should refuse to key without a secret", () => {
    expect(() => networkPrefixKey(headers("203.0.113.7"), " ")).toThrow(MissingNetworkKeySecretError);
  });
});
