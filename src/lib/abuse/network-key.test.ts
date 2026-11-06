import { describe, expect, it } from "vitest";

import { clientAddress, networkKey } from "./network-key";

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
