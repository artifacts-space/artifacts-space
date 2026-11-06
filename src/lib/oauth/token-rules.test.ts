import { describe, expect, it } from "vitest";

import { oauthAccessTokenSecret, oauthTokenGrant, type StoredAccessToken } from "./token-rules";

const resource = "https://artifacts.space/api/mcp";
const now = new Date("2026-11-06T12:00:00Z");
const valid: StoredAccessToken = {
  userId: "u1",
  scopes: ["artifacts:read", "artifacts:write", "offline_access"],
  resources: [resource],
  expiresAt: new Date("2026-11-06T13:00:00Z"),
  revoked: null,
  clientDisabled: false,
  confirmation: null,
  approved: true,
};

describe("oauthTokenGrant", () => {
  it("should act as the approving person with full access when the token is valid", () => {
    expect(oauthTokenGrant(valid, resource, now)).toEqual({ userId: "u1", access: "full" });
  });

  it("should give read-only access when the token lacks write", () => {
    expect(oauthTokenGrant({ ...valid, scopes: ["artifacts:read"] }, resource, now)).toEqual({ userId: "u1", access: "read" });
  });

  it("should refuse the token when it is bound to another resource or to none", () => {
    expect(oauthTokenGrant({ ...valid, resources: ["https://evil.example.com/api/mcp"] }, resource, now)).toBeNull();
    expect(oauthTokenGrant({ ...valid, resources: null }, resource, now)).toBeNull();
  });

  it("should refuse the token when it expired, was revoked, or its app is disabled", () => {
    expect(oauthTokenGrant({ ...valid, expiresAt: now }, resource, now)).toBeNull();
    expect(oauthTokenGrant({ ...valid, expiresAt: null }, resource, now)).toBeNull();
    expect(oauthTokenGrant({ ...valid, revoked: now }, resource, now)).toBeNull();
    expect(oauthTokenGrant({ ...valid, clientDisabled: true }, resource, now)).toBeNull();
  });

  it("should refuse the token when the person revoked the app", () => {
    expect(oauthTokenGrant({ ...valid, approved: false }, resource, now)).toBeNull();
  });

  it("should refuse a DPoP-bound token when the route only checks bearer tokens", () => {
    expect(oauthTokenGrant({ ...valid, confirmation: { jkt: "x" } }, resource, now)).toBeNull();
  });

  it("should refuse the token when it has no user or no artifacts scope", () => {
    expect(oauthTokenGrant({ ...valid, userId: null }, resource, now)).toBeNull();
    expect(oauthTokenGrant({ ...valid, scopes: ["offline_access"] }, resource, now)).toBeNull();
  });
});

describe("oauthAccessTokenSecret", () => {
  it("should strip the prefix when the value is an OAuth access token", () => {
    expect(oauthAccessTokenSecret("artifacts_oat_abc")).toBe("abc");
  });

  it("should return null when the value is an API token or a bare prefix", () => {
    expect(oauthAccessTokenSecret("artifacts_abc")).toBeNull();
    expect(oauthAccessTokenSecret("artifacts_oat_")).toBeNull();
  });
});
