import { createDecipheriv, createECDH, hkdfSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { encryptPushMessage, freshEphemeral } from "./encrypt";

const b64 = (value: string) => new Uint8Array(Buffer.from(value, "base64url"));

/* The worked example in RFC 8291, section 5. */
const rfc = {
  plaintext: "When I grow up, I want to be a watermelon",
  senderPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  receiverPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  receiverPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  message:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

/** Decrypts as the browser would, from its private key. */
function decrypt(message: Uint8Array, receiverPrivate: Uint8Array, receiverPublic: Uint8Array, auth: Uint8Array) {
  const salt = message.slice(0, 16);
  const keyLength = message[20] ?? 0;
  const senderPublic = message.slice(21, 21 + keyLength);
  const body = message.slice(21 + keyLength);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(receiverPrivate);
  const shared = ecdh.computeSecret(senderPublic);
  const info = (text: string) => Buffer.concat([Buffer.from(text), Buffer.from([0])]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, auth, Buffer.concat([info("WebPush: info"), receiverPublic, senderPublic]), 32));
  const key = Buffer.from(hkdfSync("sha256", ikm, salt, info("Content-Encoding: aes128gcm"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, info("Content-Encoding: nonce"), 12));
  const decipher = createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(body.slice(-16));
  const padded = Buffer.concat([decipher.update(body.slice(0, -16)), decipher.final()]);
  return padded.subarray(0, padded.lastIndexOf(2)).toString("utf8");
}

describe("encryptPushMessage", () => {
  it("should produce the RFC 8291 example message when given its keys and salt", () => {
    const message = encryptPushMessage(new TextEncoder().encode(rfc.plaintext), { p256dh: b64(rfc.receiverPublic), auth: b64(rfc.auth) }, { privateKey: b64(rfc.senderPrivate), salt: b64(rfc.salt) });
    expect(Buffer.from(message).toString("base64url")).toBe(rfc.message);
  });

  it("should decrypt to the same text in the browser when the sender key is fresh", () => {
    const message = encryptPushMessage(new TextEncoder().encode("hello"), { p256dh: b64(rfc.receiverPublic), auth: b64(rfc.auth) }, freshEphemeral());
    expect(decrypt(message, b64(rfc.receiverPrivate), b64(rfc.receiverPublic), b64(rfc.auth))).toBe("hello");
  });

  it("should refuse keys of the wrong size", () => {
    expect(() => encryptPushMessage(new Uint8Array([1]), { p256dh: new Uint8Array(10), auth: b64(rfc.auth) })).toThrow();
  });
});
