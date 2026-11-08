import { createCipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";

/**
 * Web Push message encryption (RFC 8291, aes128gcm from RFC 8188), with
 * node:crypto only. The push service (Google, Mozilla, Apple, Microsoft)
 * carries the message but cannot read it: only the browser that subscribed
 * holds the key.
 */

/** A browser's push keys from its subscription: the P-256 public key and the 16-byte auth secret. */
export interface PushKeys {
  p256dh: Uint8Array;
  auth: Uint8Array;
}

/** The sender's one-time key and salt. Random for every message; tests pass fixed ones. */
export interface EphemeralInput {
  privateKey: Uint8Array;
  salt: Uint8Array;
}

const RECORD_SIZE = 4096;
const encoder = new TextEncoder();

function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  return new Uint8Array(hkdfSync("sha256", ikm, salt, info, length));
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function label(text: string) {
  return concat(encoder.encode(text), new Uint8Array([0]));
}

/** A fresh one-time sender key and salt. */
export function freshEphemeral(): EphemeralInput {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { privateKey: new Uint8Array(ecdh.getPrivateKey()), salt: new Uint8Array(randomBytes(16)) };
}

/**
 * Encrypts one message for one browser, as a single aes128gcm record:
 * salt, record size, the sender's public key, then the ciphertext.
 * Throws when the browser's key is not a valid P-256 point.
 */
export function encryptPushMessage(plaintext: Uint8Array, keys: PushKeys, ephemeral: EphemeralInput = freshEphemeral()): Uint8Array<ArrayBuffer> {
  if (keys.p256dh.length !== 65 || keys.auth.length !== 16) throw new Error("Invalid push subscription keys.");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(ephemeral.privateKey);
  const senderPublic = new Uint8Array(ecdh.getPublicKey());
  const shared = new Uint8Array(ecdh.computeSecret(keys.p256dh));
  const ikm = hkdf(keys.auth, shared, concat(label("WebPush: info"), keys.p256dh, senderPublic), 32);
  const contentKey = hkdf(ephemeral.salt, ikm, label("Content-Encoding: aes128gcm"), 16);
  const nonce = hkdf(ephemeral.salt, ikm, label("Content-Encoding: nonce"), 12);
  const cipher = createCipheriv("aes-128-gcm", contentKey, nonce);
  // 0x02 marks the last (and only) record, with no padding.
  const body = concat(new Uint8Array(cipher.update(concat(plaintext, new Uint8Array([2])))), new Uint8Array(cipher.final()), new Uint8Array(cipher.getAuthTag()));
  const header = new Uint8Array(21);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header.set(ephemeral.salt, 0);
  header[20] = senderPublic.length;
  return concat(header, senderPublic, body);
}
