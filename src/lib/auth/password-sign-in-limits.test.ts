import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isJsonRequest, isPasswordSignInRequest, passwordFailureKey, passwordSignInChecks, passwordSignInEmail } from "./password-sign-in-limits";

const secret = "test-secret";

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
  it("should limit by network and by network and address together when an address is given", () => {
    const checks = passwordSignInChecks("net", "ada@example.com", secret);
    expect(checks.map((check) => check.name)).toEqual(["passwordSignInByNetwork", "passwordSignInByNetworkDay", "passwordSignInByNetworkEmail"]);
    expect(checks[2]?.subject).toMatch(/^[a-f0-9]{32}$/);
    expect(checks[2]?.subject).not.toContain("ada");
  });

  it("should count the same address from another network under another key, so others cannot lock it", () => {
    const mine = passwordSignInChecks("reviewer-net", "reviewer@artifacts.space", secret)[2]?.subject;
    const theirs = passwordSignInChecks("other-net", "reviewer@artifacts.space", secret)[2]?.subject;
    expect(mine).toBeDefined();
    expect(mine).not.toBe(theirs);
  });

  it("should count one address under one key when it is typed with different case and spaces", () => {
    const subjects = [" Ada@Example.com ", "ada@example.com"].map((typed) => passwordSignInChecks("net", passwordSignInEmail({ email: typed }), secret)[2]?.subject);
    expect(subjects[0]).toBe(subjects[1]);
  });

  it("should limit by network only when there is no address", () => {
    expect(passwordSignInChecks("net", null, secret).map((check) => check.name)).toEqual(["passwordSignInByNetwork", "passwordSignInByNetworkDay"]);
  });
});

describe("passwordFailureKey", () => {
  it("should key the address with the server secret, not a plain hash anyone can recompute", () => {
    const key = passwordFailureKey("reviewer@artifacts.space", secret);
    expect(key).toMatch(/^[a-f0-9]{32}$/);
    expect(key).not.toBe(passwordFailureKey("reviewer@artifacts.space", "another-secret"));
    expect(key).not.toBe(createHash("sha256").update("reviewer@artifacts.space").digest("hex").slice(0, 32));
    expect(key).not.toBe(createHash("sha256").update("password-failures:reviewer@artifacts.space").digest("hex").slice(0, 32));
  });
});
