import { describe, expect, it } from "vitest";

import { accessFromScopes, consentScope, normalizeRequestedScope, requestsWrite } from "./scopes";

describe("normalizeRequestedScope", () => {
  it("should grant full access and a refresh token when the client asks for no scope", () => {
    expect(normalizeRequestedScope(null)).toBe("artifacts:read artifacts:write offline_access");
    expect(normalizeRequestedScope("")).toBe("artifacts:read artifacts:write offline_access");
  });

  it("should keep a read-only request read-only when the client asks only to read", () => {
    expect(normalizeRequestedScope("artifacts:read")).toBe("artifacts:read offline_access");
  });

  it("should add read when the client asks only for write", () => {
    expect(normalizeRequestedScope("artifacts:write")).toBe("artifacts:read artifacts:write offline_access");
  });

  it("should drop scopes this server does not offer when the client asks for OpenID scopes", () => {
    expect(normalizeRequestedScope("openid profile email artifacts:read")).toBe("artifacts:read offline_access");
    expect(normalizeRequestedScope("openid profile")).toBe("artifacts:read artifacts:write offline_access");
  });
});

describe("accessFromScopes", () => {
  it("should map write to full access and read alone to read-only", () => {
    expect(accessFromScopes(["artifacts:read", "artifacts:write"])).toBe("full");
    expect(accessFromScopes(["artifacts:read", "offline_access"])).toBe("read");
  });

  it("should give no access when no artifacts scope was granted", () => {
    expect(accessFromScopes(["offline_access"])).toBeNull();
    expect(accessFromScopes([])).toBeNull();
  });
});

describe("consentScope", () => {
  it("should drop write when the person chooses read-only", () => {
    expect(consentScope("artifacts:read artifacts:write offline_access", true)).toBe("artifacts:read offline_access");
  });

  it("should approve everything requested when the person keeps full access", () => {
    expect(consentScope("artifacts:read artifacts:write offline_access", false)).toBe("artifacts:read artifacts:write offline_access");
  });
});

describe("requestsWrite", () => {
  it("should say whether there is a read-only choice to make", () => {
    expect(requestsWrite("artifacts:read artifacts:write")).toBe(true);
    expect(requestsWrite("artifacts:read offline_access")).toBe(false);
    expect(requestsWrite(null)).toBe(false);
  });
});
