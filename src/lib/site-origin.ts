/**
 * This site's origin for absolute links in emails, MCP results, and anywhere
 * else a link leaves the page. It never reads the request, so a forged Host
 * header cannot change where links point.
 *
 * Order: BETTER_AUTH_URL; then https://VERCEL_PROJECT_PRODUCTION_URL; then
 * http://localhost:3000 under `next dev` only. Anything else throws.
 */
export function siteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  if (env.BETTER_AUTH_URL) return new URL(env.BETTER_AUTH_URL).origin;
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`).origin;
  if (env.NODE_ENV === "development") return "http://localhost:3000";
  throw new Error("Set BETTER_AUTH_URL so the app can build absolute links.");
}

/** An absolute URL on this site for a path such as "/artifact/abc". */
export function siteUrl(path: string, env: NodeJS.ProcessEnv = process.env): string {
  return new URL(path, siteOrigin(env)).href;
}
