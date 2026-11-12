import { describe, expect, it } from "vitest";

import {
  basicAuthClientId,
  isCountedTokenFailure,
  isKnownCode,
  isKnownRefreshToken,
  isUsableRefreshGrant,
  oauthConnectionKey,
  presentedClientId,
  refreshConnection,
  refreshTokenSecret,
  tokenRequestFields,
  unknownCredentialRoute,
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
    expect(fields).toEqual({ grantType: "refresh_token", refreshToken: "artifacts_ort_abc", code: null, clientId: "https://app.example/meta", clientAssertion: false });
    expect(tokenRequestFields("grant_type=authorization_code&code=c1", form).code).toBe("c1");
  });

  it("should read the same fields when the body is JSON", () => {
    const fields = tokenRequestFields(JSON.stringify({ grant_type: "refresh_token", refresh_token: "artifacts_ort_abc", client_id: "c" }), "application/json; charset=utf-8");
    expect(fields).toEqual({ grantType: "refresh_token", refreshToken: "artifacts_ort_abc", code: null, clientId: "c", clientAssertion: false });
  });

  it("should read nothing when the body is broken, empty, or the wrong type", () => {
    const empty = { grantType: null, refreshToken: null, code: null, clientId: null, clientAssertion: false };
    expect(tokenRequestFields("{not json", "application/json")).toEqual(empty);
    expect(tokenRequestFields("[1,2]", "application/json")).toEqual(empty);
    expect(tokenRequestFields(JSON.stringify({ grant_type: 7, refresh_token: ["x"] }), "application/json")).toEqual(empty);
    expect(tokenRequestFields("", form)).toEqual(empty);
  });

  it("should drop the client and note an assertion when Better Auth would read the body differently", () => {
    expect(tokenRequestFields("client_id=a&client_id=b", form).clientId).toBeNull();
    expect(tokenRequestFields("client_id=a&client_id=", form).clientId).toBe("a");
    expect(tokenRequestFields("client_assertion=x&client_id=a", form).clientAssertion).toBe(true);
  });
});

describe("presentedClientId", () => {
  const body = (clientId: string | null) => ({ grantType: null, refreshToken: null, code: null, clientId, clientAssertion: false });

  it("should take the Basic header's client over the body's when both name one, as Better Auth does", () => {
    expect(presentedClientId(body("body"), `Basic ${btoa("basic:secret")}`)).toBe("basic");
    expect(presentedClientId(body("body"), `basic   ${btoa("basic:secret")}`)).toBe("basic");
  });

  it("should take the body's client when there is no Authorization header", () => {
    expect(presentedClientId(body("body"), null)).toBe("body");
  });

  it("should find no client when the header is there but Better Auth would refuse it", () => {
    expect(presentedClientId(body("body"), "Bearer abc")).toBeNull();
    expect(presentedClientId(body("body"), `Basic ${btoa("basic:")}`)).toBeNull();
    expect(presentedClientId(body("body"), `Basic ${btoa(":secret")}`)).toBeNull();
  });

  it("should find no client when the request carries a client assertion", () => {
    expect(presentedClientId({ ...body("body"), clientAssertion: true }, null)).toBeNull();
  });

  it("should form-decode the Basic header's client and split it at the first colon", () => {
    expect(basicAuthClientId(`Basic ${btoa("my%20app:secret")}`)).toBe("my app");
    expect(basicAuthClientId(`Basic ${btoa("app:se:cret")}`)).toBe("app");
  });

  it("should find no client when the header is missing, not Basic, or malformed", () => {
    expect(basicAuthClientId(null)).toBeNull();
    expect(basicAuthClientId("Bearer abc")).toBeNull();
    expect(basicAuthClientId(`Basic ${btoa("no-separator")}`)).toBeNull();
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

describe("isKnownRefreshToken", () => {
  it("should know a token in any state when the client it was issued to presents it", () => {
    expect(isKnownRefreshToken(live, "client-1")).toBe(true);
    expect(isKnownRefreshToken({ ...live, revoked: earlier }, "client-1")).toBe(true);
    expect(isKnownRefreshToken({ ...live, expiresAt: earlier }, "client-1")).toBe(true);
  });

  it("should not know a token when another client or no client presents it", () => {
    expect(isKnownRefreshToken(live, "client-2")).toBe(false);
    expect(isKnownRefreshToken(live, null)).toBe(false);
  });
});

describe("isKnownCode", () => {
  const value = JSON.stringify({ type: "authorization_code", query: { client_id: "client-1", redirect_uri: "https://app.example/cb" }, userId: "u" });

  it("should know a stored code, expired or not, when the client it was issued to presents it", () => {
    expect(isKnownCode({ values: [value], tokenClientIds: [] }, "client-1")).toBe(true);
  });

  it("should know a used code when tokens issued from it belong to the presenting client", () => {
    expect(isKnownCode({ values: [], tokenClientIds: ["client-1"] }, "client-1")).toBe(true);
  });

  it("should not know a code for another client, with no client, or with nothing stored", () => {
    expect(isKnownCode({ values: [value], tokenClientIds: ["client-1"] }, "client-2")).toBe(false);
    expect(isKnownCode({ values: [value], tokenClientIds: [] }, null)).toBe(false);
    expect(isKnownCode({ values: [], tokenClientIds: [] }, "client-1")).toBe(false);
  });

  it("should not know a stored row that is not an authorization code when another flow wrote it", () => {
    expect(isKnownCode({ values: ["not json"], tokenClientIds: [] }, "client-1")).toBe(false);
    expect(isKnownCode({ values: [JSON.stringify({ type: "magic-link", query: { client_id: "client-1" } })], tokenClientIds: [] }, "client-1")).toBe(false);
  });
});

describe("unknownCredentialRoute", () => {
  const refreshFields = tokenRequestFields("grant_type=refresh_token&refresh_token=artifacts_ort_gone&client_id=client-1", form);
  const codeFields = tokenRequestFields("grant_type=authorization_code&code=gone&code_verifier=v&client_id=client-1", form);

  it("should send a refresh token or code we no longer hold on to Better Auth when a plain client id presents it", () => {
    expect(unknownCredentialRoute(refreshFields, "client-1")).toBe("answer");
    expect(unknownCredentialRoute(codeFields, "client-1")).toBe("answer");
  });

  it("should send it on only for a stored app when the client id is a metadata-document address", () => {
    expect(unknownCredentialRoute(refreshFields, "https://assistant.example/oauth/metadata.json")).toBe("answer-if-stored");
    expect(unknownCredentialRoute(codeFields, "https://assistant.example/client")).toBe("answer-if-stored");
  });

  it("should not take an http address for a metadata document when the plugin would not fetch it", () => {
    expect(unknownCredentialRoute(refreshFields, "http://assistant.example/client")).toBe("answer");
  });

  it("should make the request wait when it names no client the plain way", () => {
    expect(unknownCredentialRoute(refreshFields, null)).toBe("wait");
    const asserted = tokenRequestFields("grant_type=refresh_token&refresh_token=artifacts_ort_gone&client_id=client-1&client_assertion=jwt&client_assertion_type=t", form);
    expect(unknownCredentialRoute(asserted, presentedClientId(asserted, null))).toBe("wait");
    expect(unknownCredentialRoute(refreshFields, presentedClientId(refreshFields, "Bearer abc"))).toBe("wait");
  });

  it("should make the request wait when it carries no refresh token or code for its grant type", () => {
    expect(unknownCredentialRoute(tokenRequestFields("grant_type=refresh_token&client_id=client-1", form), "client-1")).toBe("wait");
    expect(unknownCredentialRoute(tokenRequestFields("grant_type=authorization_code&refresh_token=artifacts_ort_x&client_id=client-1", form), "client-1")).toBe("wait");
    expect(unknownCredentialRoute(tokenRequestFields("grant_type=client_credentials&client_id=client-1", form), "client-1")).toBe("wait");
    expect(unknownCredentialRoute(tokenRequestFields("grant_type=password&code=x&client_id=client-1", form), "client-1")).toBe("wait");
    expect(unknownCredentialRoute(tokenRequestFields("{not json", "application/json"), null)).toBe("wait");
  });
});
