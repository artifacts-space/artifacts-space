import { createECDH, createPrivateKey, sign, type KeyObject } from "node:crypto";

/**
 * VAPID (RFC 8292): the server's identity for push services. The keys come
 * from the environment (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT);
 * without valid ones, browser notifications are off and the option is hidden.
 * The private key is never logged or sent anywhere.
 */

/** Ready-to-use VAPID settings. */
export interface VapidConfig {
  /** The public key, base64url: browsers subscribe with it. */
  publicKey: string;
  privateKey: KeyObject;
  /** A mailto: or https: contact for push services. */
  subject: string;
}

const subjectPattern = /^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/;

function decode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value.trim(), "base64url"));
}

/** Left-pads a private key that lost leading zero bytes. */
function padKey(raw: Uint8Array): Uint8Array {
  if (raw.length >= 32) return raw;
  const padded = new Uint8Array(32);
  padded.set(raw, 32 - raw.length);
  return padded;
}

/**
 * Parses and checks VAPID settings: a 65-byte P-256 public key, the matching
 * 32-byte private key, and a mailto: or https: subject. Null when any is
 * missing or they do not match, so the feature stays off instead of failing.
 */
export function parseVapidConfig(env: { publicKey?: string | undefined; privateKey?: string | undefined; subject?: string | undefined }): VapidConfig | null {
  const { publicKey, privateKey, subject } = env;
  if (!publicKey || !privateKey || !subject || !subjectPattern.test(subject.trim())) return null;
  try {
    const pub = decode(publicKey);
    const priv = padKey(decode(privateKey));
    if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32) return null;
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(priv);
    if (!Buffer.from(ecdh.getPublicKey()).equals(Buffer.from(pub))) return null;
    const jwk = {
      kty: "EC",
      crv: "P-256",
      d: Buffer.from(priv).toString("base64url"),
      x: Buffer.from(pub.slice(1, 33)).toString("base64url"),
      y: Buffer.from(pub.slice(33, 65)).toString("base64url"),
    };
    return { publicKey: Buffer.from(pub).toString("base64url"), privateKey: createPrivateKey({ key: jwk, format: "jwk" }), subject: subject.trim() };
  } catch {
    return null;
  }
}

let cached: { config: VapidConfig | null } | undefined;

/** The VAPID settings from the environment, read on first use. Null when browser notifications are not set up. */
export function vapidConfig(): VapidConfig | null {
  cached ??= { config: parseVapidConfig({ publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT }) };
  return cached.config;
}

/** VAPID tokens last 12 hours; push services refuse more than 24. */
const TOKEN_SECONDS = 12 * 60 * 60;

/** The Authorization header for one push service origin: a signed ES256 JWT and the public key. */
export function vapidAuthorization(config: VapidConfig, endpoint: string, now: Date = new Date()): string {
  const audience = new URL(endpoint).origin;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ typ: "JWT", alg: "ES256" })}.${encode({ aud: audience, exp: Math.floor(now.getTime() / 1000) + TOKEN_SECONDS, sub: config.subject })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: config.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `vapid t=${unsigned}.${signature}, k=${config.publicKey}`;
}
