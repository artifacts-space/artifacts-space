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
    expect(checks.map((check) => check.name)).toEqual(["magicLinkByNetwork", "magicLinkByEmail"]);
    expect(checks[1]?.subject).toMatch(/^[a-f0-9]{32}$/);
    expect(checks[1]?.subject).not.toContain("ada");
  });

  it("should limit by network only when there is no address", () => {
    expect(magicLinkChecks("net", null).map((check) => check.name)).toEqual(["magicLinkByNetwork"]);
  });
});
