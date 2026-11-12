import { describe, expect, it } from "vitest";

import { magicLinkChecks } from "./magic-link-limits";
import { isJsonRequest, isPasswordSignInRequest, passwordSignInChecks, passwordSignInEmail } from "./password-sign-in-limits";

describe("isPasswordSignInRequest", () => {
  it("should match only a POST to the password sign-in endpoint", () => {
    expect(isPasswordSignInRequest("POST", "/api/auth/sign-in/email")).toBe(true);
    expect(isPasswordSignInRequest("POST", "/api/auth/sign-in/email/")).toBe(true);
    expect(isPasswordSignInRequest("GET", "/api/auth/sign-in/email")).toBe(false);
    expect(isPasswordSignInRequest("POST", "/api/auth/sign-in/magic-link")).toBe(false);
  });
});

describe("isJsonRequest", () => {
  it("should accept JSON with or without a charset and refuse every other body", () => {
    expect(isJsonRequest("application/json")).toBe(true);
    expect(isJsonRequest("Application/JSON; charset=utf-8")).toBe(true);
    expect(isJsonRequest("application/x-www-form-urlencoded")).toBe(false);
    expect(isJsonRequest("text/plain")).toBe(false);
    expect(isJsonRequest(null)).toBe(false);
  });
});

describe("passwordSignInEmail", () => {
  it("should lowercase the address when the body has one", () => {
    expect(passwordSignInEmail({ email: " Ada@Example.com ", password: "x" })).toBe("ada@example.com");
  });

  it("should return null when the body has no address", () => {
    expect(passwordSignInEmail(null)).toBeNull();
    expect(passwordSignInEmail({ email: 3 })).toBeNull();
  });
});

describe("passwordSignInChecks", () => {
  it("should limit by network and by a hash of the address when an address is given", () => {
    const checks = passwordSignInChecks("net", "ada@example.com");
    expect(checks.map((check) => check.name)).toEqual(["passwordSignInByNetwork", "passwordSignInByNetworkDay", "passwordSignInByEmail", "passwordSignInByEmailDay"]);
    for (const check of checks.slice(0, 2)) expect(check.subject).toBe("net");
    for (const check of checks.slice(2)) {
      expect(check.subject).toMatch(/^[a-f0-9]{32}$/);
      expect(check.subject).not.toContain("ada");
    }
  });

  it("should count one address under one key when it is typed with different case and spaces", () => {
    const subjects = [" Ada@Example.com ", "ada@example.com"].map((typed) => passwordSignInChecks("net", passwordSignInEmail({ email: typed }))[2]?.subject);
    expect(subjects[0]).toBeDefined();
    expect(subjects[0]).toBe(subjects[1]);
  });

  it("should key an address apart from its sign-in link counters", () => {
    expect(passwordSignInChecks("net", "ada@example.com")[2]?.subject).not.toBe(magicLinkChecks("net", "ada@example.com")[3]?.subject);
  });

  it("should limit by network only when there is no address", () => {
    expect(passwordSignInChecks("net", null).map((check) => check.name)).toEqual(["passwordSignInByNetwork", "passwordSignInByNetworkDay"]);
  });
});
