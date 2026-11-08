/**
 * Security headers for every response, as `next.config.ts` `headers()` rules.
 *
 * Next applies every matching rule, and when two rules set the same header
 * the later rule wins. Config headers also win over a header that a route
 * handler sets itself, so a route with its own policy gets a later rule here
 * that repeats that policy instead of being overwritten by the site default.
 */

/** One header, in the shape `next.config.ts` `headers()` takes. */
export interface HeaderEntry {
  key: string;
  value: string;
}

/** One `headers()` rule: a path pattern and the headers it sets. */
export interface HeaderRule {
  source: string;
  headers: HeaderEntry[];
}

/** No site may frame these pages, so nobody can overlay the consent screen or the app (clickjacking). */
export const denyFraming: HeaderEntry[] = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
];

/** Only this site may frame these responses: the artifact page shows PDF files in an iframe from /api/files. */
export const sameOriginFraming: HeaderEntry[] = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

/**
 * The raw route answers with saved content as plain text in a sandbox. Its
 * route handler sends the same policy; this rule keeps the site default from
 * replacing it (src/lib/markdown/serve.ts).
 */
export const rawContentPolicy = "default-src 'none'; sandbox; frame-ancestors 'none'";

/**
 * Browser features the site never uses. An empty allowlist turns each one off
 * for this site and for anything it embeds. Clipboard and fullscreen stay on.
 */
export const permissionsPolicy = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "hid=()",
  "display-capture=()",
].join(", ");

/**
 * Headers on every response. No Strict-Transport-Security here: Vercel
 * already sends `max-age=63072000` on every production response, and setting
 * it again could send two. `includeSubDomains` and `preload` are left out on
 * purpose: an email provider's link-tracking or bounce subdomain served over
 * plain HTTP would stop working. `strict-origin-when-cross-origin` sends other
 * sites only the origin, never the path, so an artifact link (which is the
 * key to a link-shared artifact) does not leak through the Referer header.
 * `no-referrer` would also make browsers send `Origin: null` on same-site
 * form posts, which breaks server actions such as posting a comment.
 */
const siteWide: HeaderEntry[] = [
  ...denyFraming,
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: permissionsPolicy },
];

/**
 * The security header rules, in order: the site-wide default first, then the
 * routes that need a different value. Later rules win for the same header.
 */
export function securityHeaderRules(): HeaderRule[] {
  return [
    { source: "/:path*", headers: siteWide },
    {
      // File views redirect to a short-lived R2 link: framed by our own artifact page, and no Referer to R2.
      source: "/api/files/:path*",
      headers: [...sameOriginFraming, { key: "Referrer-Policy", value: "no-referrer" }],
    },
    { source: "/artifact/:publicId/raw", headers: [{ key: "Content-Security-Policy", value: rawContentPolicy }] },
  ];
}
