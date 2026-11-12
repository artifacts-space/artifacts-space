import { describe, expect, it } from "vitest";

import {
  basicAuthClientId,
  isCountedTokenFailure,
  isUsableRefreshGrant,
  oauthConnectionKey,
  presentedClientId,
  refreshConnection,
  refreshTokenSecret,
  tokenRequestFields,
  type StoredRefreshGrant,
} from "./token-limit-rules";

const now = new Date("2026-11-12T12:00:00Z");
const later = new Date("2026-12-01T00:00:00Z");
const earlier = new Date("2026-11-12T11:59:00Z");
const form = "application/x-www-form-urlencoded";

const live: StoredRefreshGrant = { userId: "user-1", clientId: "client-1", expiresAt: later, revoked: null, rotationReplayExpiresAt: null };

describe("isCountedTokenFailure", () => {
  it("should count every client error when Better Auth refuses the request", () => {
    for (const status of [400, 401, 403, 404, 415]) expect(isCountedTokenFailure(status)).toBe(true);
  });

  it("should not count a success, a rate limit, or a server error when the caller did nothing wrong", () => {
    for (const status of [200, 201, 429, 500, 503]) expect(isCountedTokenFailure(status)).toBe(false);
  });
});

describe("tokenRequestFields", () => {
  it("should read the grant, refresh token, and client when the body is form-encoded", () => {
    const fields = tokenRequestFields("grant_type=refresh_token&refresh_token=artifacts_ort_abc&client_id=https%3A%2F%2Fapp.example%2Fmeta", form);
    expect(fields).toEqual({ grantType: "refresh_token", refreshToken: "artifacts_ort_abc", clientId: "https://app.example/meta" });
  });

  it("should read the same fields when the body is JSON", () => {
    const fields = tokenRequestFields(JSON.stringify({ grant_type: "refresh_token", refresh_token: "artifacts_ort_abc", client_id: "c" }), "application/json; charset=utf-8");
    expect(fields).toEqual({ grantType: "refresh_token", refreshToken: "artifacts_ort_abc", clientId: "c" });
  });

  it("should read nothing when the body is broken, empty, or the wrong type", () => {
    const empty = { grantType: null, refreshToken: null, clientId: null };
    expect(tokenRequestFields("{not json", "application/json")).toEqual(empty);
    expect(tokenRequestFields("[1,2]", "application/json")).toEqual(empty);
    expect(tokenRequestFields(JSON.stringify({ grant_type: 7, refresh_token: ["x"] }), "application/json")).toEqual(empty);
    expect(tokenRequestFields("", form)).toEqual(empty);
  });
});

describe("presentedClientId", () => {
  it("should take the body's client when it names one", () => {
    expect(presentedClientId({ grantType: null, refreshToken: null, clientId: "body" }, `Basic ${btoa("basic:secret")}`)).toBe("body");
  });

  it("should take the Basic header's client, form-decoded, when the body names none", () => {
    expect(basicAuthClientId(`Basic ${btoa("my%20app:secret")}`)).toBe("my app");
    expect(presentedClientId({ grantType: null, refreshToken: null, clientId: null }, `Basic ${btoa("basic:secret")}`)).toBe("basic");
  });

  it("should find no client when the header is missing, not Basic, or malformed", () => {
    expect(basicAuthClientId(null)).toBeNull();
    expect(basicAuthClientId("Bearer abc")).toBeNull();
    expect(basicAuthClientId(`Basic ${btoa("no-separator")}`)).toBeNull();
    expect(basicAuthClientId(`Basic ${btoa("%E0%A4%A:secret")}`)).toBeNull();
  });
});

describe("refreshTokenSecret", () => {
  it("should strip this server's prefix when the token has it", () => {
    expect(refreshTokenSecret("artifacts_ort_abc")).toBe("abc");
  });

  it("should refuse a token without the prefix or with nothing after it", () => {
    expect(refreshTokenSecret("abc")).toBeNull();
    expect(refreshTokenSecret("artifacts_oat_abc")).toBeNull();
    expect(refreshTokenSecret("artifacts_ort_")).toBeNull();
    expect(refreshTokenSecret(null)).toBeNull();
  });
});

describe("isUsableRefreshGrant", () => {
  it("should accept an unexpired token that has not rotated", () => {
    expect(isUsableRefreshGrant(live, now)).toBe(true);
  });

  it("should accept a rotated token only while its retry window lasts", () => {
    expect(isUsableRefreshGrant({ ...live, revoked: earlier, rotationReplayExpiresAt: later }, now)).toBe(true);
    expect(isUsableRefreshGrant({ ...live, revoked: earlier, rotationReplayExpiresAt: earlier }, now)).toBe(false);
    expect(isUsableRefreshGrant({ ...live, revoked: earlier, rotationReplayExpiresAt: null }, now)).toBe(false);
  });

  it("should refuse an expired token or one without an expiry", () => {
    expect(isUsableRefreshGrant({ ...live, expiresAt: now }, now)).toBe(false);
    expect(isUsableRefreshGrant({ ...live, expiresAt: null }, now)).toBe(false);
  });
});

describe("refreshConnection", () => {
  it("should name the person and app when the token is usable and its client presents it", () => {
    expect(refreshConnection(live, "client-1", now)).toEqual({ userId: "user-1", clientId: "client-1" });
  });

  it("should not apply when another client presents the token, so the refusal never answers for a token Better Auth would refuse", () => {
    expect(refreshConnection(live, "client-2", now)).toBeNull();
    expect(refreshConnection(live, null, now)).toBeNull();
  });

  it("should not apply when a rotated token is replayed, so Better Auth still revokes the family", () => {
    expect(refreshConnection({ ...live, revoked: earlier, rotationReplayExpiresAt: earlier }, "client-1", now)).toBeNull();
  });
});

describe("oauthConnectionKey", () => {
  it("should give one key per person and app whatever token they present", () => {
    expect(oauthConnectionKey("user-1", "client-1", "s")).toBe(oauthConnectionKey("user-1", "client-1", "s"));
  });

  it("should keep two people of one shared app apart when the app uses one client id for everyone", () => {
    const app = "https://assistant.example/oauth/metadata.json";
    expect(oauthConnectionKey("user-1", app, "s")).not.toBe(oauthConnectionKey("user-2", app, "s"));
  });

  it("should not confuse ids that only differ in where a separator falls", () => {
    expect(oauthConnectionKey("a:b", "c", "s")).not.toBe(oauthConnectionKey("a", "b:c", "s"));
  });

  it("should change with the server secret and never show the ids when keyed", () => {
    const key = oauthConnectionKey("user-1", "client-1", "s");
    expect(key).not.toBe(oauthConnectionKey("user-1", "client-1", "t"));
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(key).not.toContain("user-1");
  });
});
