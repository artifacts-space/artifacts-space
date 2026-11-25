import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { z } from "zod";

import { pageTokenSecret } from "@/lib/page-files/token";

/*
 * The render token: what lets the hosted browser that draws an HTML
 * artifact's page for artifacts_page_image open the site's render page
 * (src/app/render/page/[token]/page.tsx). That browser has no session, so
 * the MCP tool, which has checked that the caller may edit the artifact,
 * seals who asked, which artifact, and which save into the address.
 *
 * It is encrypted and authenticated (AES-256-GCM) under a key derived from
 * the server secret with a purpose of its own, so it shows nothing (not the
 * caller, not the internal id) and opens nothing else. It works for
 * `renderTokenLimits.lifeSeconds`, long enough for one render. It grants no
 * access by itself: the render page and its files address run the edit
 * check again as the caller, so someone who lost edit access in the
 * meantime gets nothing. It never reaches the page: the page runs on its
 * page host, which only gets its own page files token.
 *
 * Never log a render token or the render page's address.
 */

export const renderTokenLimits = {
  /** One render waits at most about a minute for the page; two leave room for a slow start. */
  lifeSeconds: 120,
} as const;

/** What a render token grants: one render of one artifact's page, as one person who may edit it, at one save. */
export interface RenderGrant {
  /** Who asked: the person or agent the MCP connection acts for. */
  userId: string;
  /** The artifact's internal id. */
  artifactId: string;
  /** The save the render is for, in milliseconds (`updatedAt`). A later save makes the token open nothing. */
  stamp: number;
}

const derived = new Map<string, Buffer>();

/** The key for a secret, derived with HKDF under this token's own purpose. */
function keyFor(secret: string): Buffer {
  const known = derived.get(secret);
  if (known) return known;
  const key = Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), "artifacts.space page render v1 seal", 32));
  derived.set(secret, key);
  return key;
}

const nonceBytes = 12;
const tagBytes = 16;
const bound = Buffer.from("page-render:v1");

/** Seals a grant into a token that works for renderTokenLimits.lifeSeconds from `now`. Call only after the edit check. */
export function mintRenderToken(grant: RenderGrant, now: Date = new Date(), secret: string = pageTokenSecret()): string {
  const expires = Math.floor(now.getTime() / 1000) + renderTokenLimits.lifeSeconds;
  const held = Buffer.from(JSON.stringify([grant.userId, grant.artifactId, grant.stamp, expires]));
  const nonce = randomBytes(nonceBytes);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), nonce);
  cipher.setAAD(bound);
  const sealed = Buffer.concat([cipher.update(held), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), sealed]).toString("base64url");
}

/** The shape of a render token in an address: base64url, and no longer than any token made here. */
export const renderTokenPattern = /^[A-Za-z0-9_-]{60,600}$/;

const heldSchema = z.tuple([z.string().min(1).max(200), z.string().min(1).max(200), z.number().int().nonnegative(), z.number().int().positive()]);

/**
 * Opens a render token, or returns null: for a token that is not one, was
 * changed, was made under another secret, or has ended. One answer for
 * every reason. It reads no database; the caller checks access and the save.
 */
export function openRenderToken(token: string, now: Date = new Date(), secret: string = pageTokenSecret()): RenderGrant | null {
  if (!renderTokenPattern.test(token)) return null;
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length <= nonceBytes + tagBytes) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), bytes.subarray(0, nonceBytes));
    decipher.setAAD(bound);
    decipher.setAuthTag(bytes.subarray(nonceBytes, nonceBytes + tagBytes));
    const held = Buffer.concat([decipher.update(bytes.subarray(nonceBytes + tagBytes)), decipher.final()]).toString("utf8");
    const [userId, artifactId, stamp, expires] = heldSchema.parse(JSON.parse(held));
    if (expires * 1000 <= now.getTime()) return null;
    return { userId, artifactId, stamp };
  } catch {
    return null;
  }
}
