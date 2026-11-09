import { fileLimits } from "./config";

/*
 * How long a browser may keep the /api/files/<id> redirect to a signed R2 URL.
 *
 * The two numbers are tied: a kept redirect points at the URL signed when it
 * was sent, so the browser must drop the redirect before that URL stops
 * working, or images break until a reload. Download URLs work for
 * downloadUrlSeconds (15 minutes) from their signing time, and the signing
 * time is rounded down by up to downloadSigningWindowSeconds (5 minutes), so a
 * URL works for at least 10 minutes after we send it. Keeping the redirect
 * for 4 minutes leaves 6 minutes of margin for clock skew and slow loads.
 * redirect-cache-rules.test.ts fails if the margin ever goes.
 *
 * The cost: someone who loses access can still load a file they loaded in the
 * last 4 minutes, from their own browser. The cache is `private`, so no shared
 * cache or CDN keeps it, and it varies on the cookie and the bearer token, so
 * signing out or switching accounts never reuses it.
 */

/** The shortest time a download URL keeps working after the route sends it, in seconds. */
export const downloadUrlMinLifetimeSeconds = fileLimits.downloadUrlSeconds - fileLimits.downloadSigningWindowSeconds;

/** How long the viewer's browser may reuse a file redirect, in seconds. Well under downloadUrlMinLifetimeSeconds. */
export const fileRedirectMaxAgeSeconds = 4 * 60;

/** Headers that let only the viewer's own browser keep a file redirect, and only for the same cookie and token. */
export const fileRedirectCacheHeaders = {
  "Cache-Control": `private, max-age=${String(fileRedirectMaxAgeSeconds)}`,
  Vary: "Cookie, Authorization",
} as const;
