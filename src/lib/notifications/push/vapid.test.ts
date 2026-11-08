import { createECDH, createPublicKey, verify } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseVapidConfig, vapidAuthorization } from "./vapid";

function keys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: ecdh.getPrivateKey().toString("base64url") };
}

describe("parseVapidConfig", () => {
  it("should accept a matching key pair with a mailto subject", () => {
    expect(parseVapidConfig({ ...keys(), subject: "mailto:ops@example.com" })).not.toBeNull();
  });

  it("should turn browser notifications off when a value is missing", () => {
    expect(parseVapidConfig({ ...keys(), subject: undefined })).toBeNull();
    expect(parseVapidConfig({ publicKey: keys().publicKey, subject: "mailto:ops@example.com" })).toBeNull();
  });

  it("should refuse keys that do not belong together", () => {
    expect(parseVapidConfig({ publicKey: keys().publicKey, privateKey: keys().privateKey, subject: "mailto:ops@example.com" })).toBeNull();
  });

  it("should refuse a subject that is not mailto or https", () => {
    expect(parseVapidConfig({ ...keys(), subject: "http://example.com" })).toBeNull();
  });
});

describe("vapidAuthorization", () => {
  it("should sign a token for the push service's origin that the public key verifies", () => {
    const pair = keys();
    const config = parseVapidConfig({ ...pair, subject: "https://artifacts.space" });
    if (!config) throw new Error("config");
    const now = new Date("2026-11-08T12:00:00Z");
    const header = vapidAuthorization(config, "https://fcm.googleapis.com/fcm/send/abc", now);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match?.[4]).toBe(pair.publicKey);
    const [, head = "", body = "", signature = ""] = match ?? [];
    expect(JSON.parse(Buffer.from(body, "base64url").toString())).toEqual({ aud: "https://fcm.googleapis.com", exp: Math.floor(now.getTime() / 1000) + 43_200, sub: "https://artifacts.space" });
    const raw = Buffer.from(pair.publicKey, "base64url");
    const publicKey = createPublicKey({ key: { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33).toString("base64url") }, format: "jwk" });
    expect(verify("sha256", Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(true);
  });
});
