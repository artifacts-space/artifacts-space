import { createHash } from "node:crypto";

/**
 * The visitor's network address from proxy headers. Vercel sets
 * x-forwarded-for with the client first and x-real-ip; anything else is
 * "unknown", which then shares one rate limit.
 */
export function clientAddress(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Thrown when network keys cannot be made safely: the hashing secret is missing. */
export class MissingNetworkKeySecretError extends Error {
  constructor() {
    super("BETTER_AUTH_SECRET is not set, so network addresses cannot be hashed for rate limits and reports. Set it before serving requests.");
    this.name = "MissingNetworkKeySecretError";
  }
}

/**
 * The secret network keys are hashed with. Read on each use, never at import
 * time, so the build needs no secrets. Throws when it is missing or blank:
 * without it, a key is a plain hash of the address, which anyone can reverse
 * by hashing every IPv4 address.
 */
export function networkKeySecret(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new MissingNetworkKeySecretError();
  return secret;
}

/**
 * A stable, non-reversible key for the visitor's network, for rate limits and
 * report records. Raw addresses are never stored. Throws
 * MissingNetworkKeySecretError when there is no secret to hash with.
 */
export function networkKey(headers: Pick<Headers, "get">, secret?: string): string {
  const key = secret ?? networkKeySecret();
  if (!key.trim()) throw new MissingNetworkKeySecretError();
  return createHash("sha256").update(`${key}:${clientAddress(headers)}`).digest("hex").slice(0, 32);
}

const ipv4MappedIpv6 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const hextet = /^[0-9a-f]{1,4}$/;

/** The eight hextets of a written IPv6 address, or null when it is not one. Zone ids and brackets are dropped. */
function ipv6Hextets(address: string): string[] | null {
  const clean = (address.replace(/^\[|\]$/g, "").split("%")[0] ?? "").toLowerCase();
  const halves = clean.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => "0"), ...tail];
  return all.every((part) => hextet.test(part)) ? all : null;
}

/**
 * The part of a client address one subscriber controls: an IPv4 address as
 * is (an IPv4-mapped IPv6 address counts as IPv4), and an IPv6 address as its
 * /64, because one home or phone line is usually handed a whole /64 and can
 * pick a fresh address in it for every request. Anything else is unchanged.
 */
export function addressPrefix(address: string): string {
  const mapped = ipv4MappedIpv6.exec(address);
  if (mapped?.[1]) return mapped[1];
  if (!address.includes(":")) return address;
  const hextets = ipv6Hextets(address);
  if (!hextets) return address;
  return `${hextets.slice(0, 4).map((part) => part.padStart(4, "0")).join(":")}::/64`;
}

/**
 * Like networkKey, but an IPv6 client is keyed by its /64 (addressPrefix).
 * Used by the password sign-in limits and the OAuth token and registration
 * limits (src/lib/oauth/token-limits.ts, registration-limits.ts), where one
 * line rotating through its addresses must not get a fresh budget each time.
 * The other limits keep networkKey's single address.
 */
export function networkPrefixKey(headers: Pick<Headers, "get">, secret?: string): string {
  const key = secret ?? networkKeySecret();
  if (!key.trim()) throw new MissingNetworkKeySecretError();
  return createHash("sha256").update(`${key}:prefix:${addressPrefix(clientAddress(headers))}`).digest("hex").slice(0, 32);
}
