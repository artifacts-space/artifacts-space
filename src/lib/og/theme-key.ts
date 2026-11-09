import { createHash } from "node:crypto";

import type { Theme } from "@/lib/themes/schema";

/**
 * A link preview's image URL names the approved version and a short key of
 * the theme it is drawn with: `/artifact/<id>/og/<versionId>.<themeKey>`.
 * The theme can change without a new version (a team default or a team
 * preset edit), so the key gives the picture a fresh URL then, and
 * platforms that cache images by URL fetch the new one.
 */

/** Separates the version id from the theme key in the image path. Version ids are UUIDs, which never hold a dot. */
const SEPARATOR = ".";

const themeKeyPattern = /^[A-Za-z0-9_-]{10}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keys sorted at every level, so the same theme always hashes the same. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

/**
 * A short, URL-safe key of a resolved theme: the same theme gives the same
 * key, and any change to a color, font, radius, or mode gives a new one.
 * `variant` names a way the card is drawn apart from the theme (a sheet
 * whose downloads are off); it changes the key too, so the picture gets a
 * fresh URL when that changes. Without one, the key is the theme's alone.
 */
export function ogThemeKey(theme: Theme, variant: string | null = null): string {
  const hash = createHash("sha256").update(JSON.stringify(canonical(theme)));
  if (variant !== null) hash.update(`|${variant}`);
  return hash.digest("base64url").slice(0, 10);
}

/** The image path segment for one version drawn with one theme. */
export function ogImageSegment(versionId: string, themeKey: string): string {
  return `${versionId}${SEPARATOR}${themeKey}`;
}

/**
 * Reads an image path segment. A segment without a valid key (links shared
 * before keys existed) gives a null key: the picture still draws, but with
 * a short cache.
 */
export function parseOgImageSegment(segment: string): { versionId: string; themeKey: string | null } {
  const at = segment.lastIndexOf(SEPARATOR);
  if (at === -1) return { versionId: segment, themeKey: null };
  const themeKey = segment.slice(at + 1);
  return { versionId: segment.slice(0, at), themeKey: themeKeyPattern.test(themeKey) ? themeKey : null };
}
