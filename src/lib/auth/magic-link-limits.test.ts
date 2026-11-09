import { describe, expect, it } from "vitest";

import { isMagicLinkRequest, magicLinkChecks, magicLinkEmail } from "./magic-link-limits";

describe("isMagicLinkRequest", () => {
  it("should match only a POST to the sign-in link endpoint", () => {
    expect(isMagicLinkRequest("POST", "/api/auth/sign-in/magic-link")).toBe(true);
    expect(isMagicLinkRequest("POST", "/api/auth/sign-in/magic-link/")).toBe(true);
    expect(isMagicLinkRequest("GET", "/api/auth/sign-in/magic-link")).toBe(false);
    expect(isMagicLinkRequest("POST", "/api/auth/sign-in/social")).toBe(false);
  });
});

describe("magicLinkEmail", () => {
  it("should lowercase the address when the body has one", () => {
    expect(magicLinkEmail({ email: " Ada@Example.com " })).toBe("ada@example.com");
  });

  it("should return null when the body has no address", () => {
    expect(magicLinkEmail(null)).toBeNull();
    expect(magicLinkEmail({ email: 3 })).toBeNull();
  });
});

describe("magicLinkChecks", () => {
  it("should limit by network and by a hash of the address when an address is given", () => {
    const checks = magicLinkChecks("net", "ada@example.com");
    expect(checks.map((check) => check.name)).toEqual(["magicLinkByNetworkMinute", "magicLinkByNetwork", "magicLinkByNetworkDay", "magicLinkByEmailMinute", "magicLinkByEmail"]);
    for (const check of checks.slice(0, 3)) expect(check.subject).toBe("net");
    for (const check of checks.slice(3)) {
      expect(check.subject).toMatch(/^[a-f0-9]{32}$/);
      expect(check.subject).not.toContain("ada");
    }
  });

  it("should count one address under one key when it is typed with different case and spaces", () => {
    const subjects = [" Ada@Example.com ", "ada@example.com"].map((typed) => magicLinkChecks("net", magicLinkEmail({ email: typed }))[3]?.subject);
    expect(subjects[0]).toBeDefined();
    expect(subjects[0]).toBe(subjects[1]);
  });

  it("should give different addresses different keys when they share a domain", () => {
    const [first, second] = ["probe1@example.net", "probe2@example.net"].map((email) => magicLinkChecks("net", email)[3]?.subject);
    expect(first).not.toBe(second);
  });

  it("should limit by network only when there is no address", () => {
    expect(magicLinkChecks("net", null).map((check) => check.name)).toEqual(["magicLinkByNetworkMinute", "magicLinkByNetwork", "magicLinkByNetworkDay"]);
  });
});
