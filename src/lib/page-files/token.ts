import { createCipheriv, createDecipheriv, createHmac, hkdfSync } from "node:crypto";

import { z } from "zod";

/*
 * The page files token: what lets a page load its own files from its page
 * host. The page host holds no session, so the site, which has checked that
 * the viewer may read the artifact, makes a token and puts it in the
 * address of the frame: `https://<label>.<PAGE_HOST>/f/<token>/index.html`.
 * The page's relative URLs then resolve under `/f/<token>/`, and the page
 * host serves a file only for a token it can open (serve.ts).
 *
 * A token is a capability for one artifact's page files, for a short time.
 * It is encrypted and authenticated (AES-256-GCM) under a key derived from
 * the server secret, so it shows nothing: not the artifact's internal id,
 * which no reader ever gets. It is bound to the page host it was made for
 * (the label is authenticated with it), so it opens nothing on another
 * artifact's host. It names no viewer. Whoever holds it can read those
 * files until it ends, as someone who was given the page's HTML can keep
 * it; the page itself can read its own address, and already has its files.
 *
 * Never log a token, and never put one anywhere but the frame's address.
 */

/** How long a token works, and the step its end is rounded to. */
export const pageTokenLimits = {
  /** A token ends this long after the start of the step it was made in, so it works for 10 to 15 minutes. */
  lifeSeconds: 15 * 60,
  /** Tokens made within one step for the same files are the same token, so repeat views reuse one address and the browser's cache. */
  stepSeconds: 5 * 60,
} as const;

/** What a token grants: the page files of one artifact, on one page host, as one version has them. */
export interface PageGrant {
  /** The artifact's internal id. */
  artifactId: string;
  /** The page host's label the token is for (pageLabelFor). */
  label: string;
  /** Set for a reader of an approved version, and for a version in History: the files as they were at this time. Null reads the latest. */
  asOf: Date | null;
  /** The artifact's last save, in milliseconds. It decides nothing: a save gives the next token a new address, so no browser shows a replaced file from its cache. */
  stamp: number;
}

/** A token and when it ends. */
export interface PageToken {
  token: string;
  expiresAt: Date;
}

/** Thrown when no token can be made or opened safely: the server secret is missing. */
export class MissingPageTokenSecretError extends Error {
  constructor() {
    super("BETTER_AUTH_SECRET is not set, so page file addresses cannot be made. Set it before serving requests.");
    this.name = "MissingPageTokenSecretError";
  }
}

/** The server secret the token keys are derived from. Read on each use, never at import time, so the build needs no secrets. */
export function pageTokenSecret(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new MissingPageTokenSecretError();
  return secret;
}

interface TokenKeys {
  /** Encrypts and authenticates the token. */
  seal: Buffer;
  /** Derives each token's nonce from what it holds. */
  nonce: Buffer;
}

const derived = new Map<string, TokenKeys>();

/** The token keys for a secret: each derived with HKDF under its own purpose, so no other use of the secret shares a key with tokens. */
function keysFor(secret: string): TokenKeys {
  const known = derived.get(secret);
  if (known) return known;
  const derive = (purpose: string) => Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), `artifacts.space page files v1 ${purpose}`, 32));
  const keys = { seal: derive("seal"), nonce: derive("nonce") };
  derived.set(secret, keys);
  return keys;
}

const nonceBytes = 12;
const tagBytes = 16;

/** What is authenticated with a token but not held in it: the page host it is for. */
function bound(label: string): Buffer {
  return Buffer.from(`page-files:v1:${label}`);
}

/** The time a token made at `now` ends: the start of its step, plus a token's life. */
function expiryFor(now: Date): number {
  const step = pageTokenLimits.stepSeconds;
  return Math.floor(now.getTime() / 1000 / step) * step + pageTokenLimits.lifeSeconds;
}

/**
 * Makes the token for a grant. Call only for a viewer who passed the
 * artifact's access check. Two calls within one step for the same grant
 * give the same token: its nonce is derived from what it holds (a keyed
 * hash of the grant, its end, and its page host), so one nonce never seals
 * two different tokens.
 */
export function mintPageToken(grant: PageGrant, now: Date = new Date(), secret: string = pageTokenSecret()): PageToken {
  const keys = keysFor(secret);
  const expires = expiryFor(now);
  const held = Buffer.from(JSON.stringify([grant.artifactId, grant.asOf?.getTime() ?? 0, expires, grant.stamp]));
  const host = bound(grant.label);
  const nonce = createHmac("sha256", keys.nonce).update(host).update("\n").update(held).digest().subarray(0, nonceBytes);
  const cipher = createCipheriv("aes-256-gcm", keys.seal, nonce);
  cipher.setAAD(host);
  const sealed = Buffer.concat([cipher.update(held), cipher.final()]);
  return { token: Buffer.concat([nonce, cipher.getAuthTag(), sealed]).toString("base64url"), expiresAt: new Date(expires * 1000) };
}

/** The shape of a token in an address: base64url, and no longer than any token made here. */
export const pageTokenPattern = /^[A-Za-z0-9_-]{60,400}$/;

const heldSchema = z.tuple([z.string().min(1).max(200), z.number().int().nonnegative(), z.number().int().positive(), z.number()]);

/** What a token that opened grants. */
export interface OpenedPageToken {
  artifactId: string;
  asOf: Date | null;
  expiresAt: Date;
}

/**
 * Opens a token on the page host `label`, or returns null: for a token
 * that is not one, was changed, was made under another secret, was made
 * for another page host, or has ended. One answer for every reason. It
 * reads no database.
 */
export function openPageToken(token: string, label: string, now: Date = new Date(), secret: string = pageTokenSecret()): OpenedPageToken | null {
  if (!pageTokenPattern.test(token)) return null;
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length <= nonceBytes + tagBytes) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keysFor(secret).seal, bytes.subarray(0, nonceBytes));
    decipher.setAAD(bound(label));
    decipher.setAuthTag(bytes.subarray(nonceBytes, nonceBytes + tagBytes));
    const held = Buffer.concat([decipher.update(bytes.subarray(nonceBytes + tagBytes)), decipher.final()]).toString("utf8");
    const [artifactId, asOf, expires] = heldSchema.parse(JSON.parse(held));
    if (expires * 1000 <= now.getTime()) return null;
    return { artifactId, asOf: asOf > 0 ? new Date(asOf) : null, expiresAt: new Date(expires * 1000) };
  } catch {
    return null;
  }
}
