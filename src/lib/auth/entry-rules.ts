import { safeNextPath } from "@/lib/safe-next";

/**
 * Pure decisions for the pages a signed-in person should skip: the landing
 * page (`/`) and the sign-in and sign-up pages. src/proxy.ts applies them.
 *
 * The landing page is static and served from the CDN, so it never knows who
 * is signed in. The proxy runs on it only when a Better Auth session cookie
 * is present (the `has` matcher in src/proxy.ts), and then sends the visitor
 * to the workspace on cookie presence alone, with no session lookup.
 *
 * A stale cookie must not cause a loop. Only `/` trusts cookie presence. The
 * workspace and the sign-in pages check the real session, and when it is
 * gone they expire the auth cookies, so the next visit to `/` is signed out:
 *
 *   /  ->  /app  ->  /sign-in?next=/app  (cookies expired)  ->  stays
 */

/** Where a signed-in visitor lands instead of the landing or sign-in pages. */
export const workspaceHome = "/app";

/** The query flag that shows the landing page to a signed-in visitor: `/?home`. */
export const landingPageFlag = "home";

/** The entry pages this module decides for, or null for every other path. */
export type EntryPage = "landing" | "auth" | null;

const authPagePath = /^\/sign-(?:in|up)\/?$/;

/** Which entry page a request is for. Only page loads (GET, HEAD) count. */
export function entryPageFor(method: string, pathname: string): EntryPage {
  if (method !== "GET" && method !== "HEAD") return null;
  if (pathname === "/") return "landing";
  return authPagePath.test(pathname) ? "auth" : null;
}

export type EntryDecision =
  | { action: "pass" }
  | { action: "redirect"; to: string }
  | { action: "check-session" };

/**
 * What to do before any session lookup. Without a session cookie every entry
 * page is served as is. With one, `/` redirects to the workspace (unless the
 * visitor asked for the landing page with `/?home`), and the sign-in pages
 * ask for the real session first.
 */
export function entryDecisionFor(page: Exclude<EntryPage, null>, hasSessionCookie: boolean, search: URLSearchParams): EntryDecision {
  if (!hasSessionCookie) return { action: "pass" };
  if (page === "auth") return { action: "check-session" };
  return search.has(landingPageFlag) ? { action: "pass" } : { action: "redirect", to: workspaceHome };
}

export type SessionDecision =
  | { action: "redirect"; to: string; expireCookies: boolean }
  | { action: "pass"; expireCookies: boolean };

/**
 * After the real session check on a sign-in page: a signed-in person goes on
 * to `next` (when it stays on this site) or the workspace; anyone else sees
 * the page, and their stale auth cookies are expired.
 */
export function authPageDecisionFor(signedIn: boolean, next: string | null): SessionDecision {
  if (signedIn) return { action: "redirect", to: safeNextPath(next) ?? workspaceHome, expireCookies: false };
  return { action: "pass", expireCookies: true };
}

/**
 * After the real session check on a workspace page: a signed-in person sees
 * the page; anyone else goes to sign-in, and their stale auth cookies are
 * expired so `/` stops sending them back here.
 */
export function workspaceDecisionFor(signedIn: boolean, signInUrl: string): SessionDecision {
  if (signedIn) return { action: "pass", expireCookies: false };
  return { action: "redirect", to: signInUrl, expireCookies: true };
}

/** Better Auth's session cookies: the token, the 5-minute session cache (maybe chunked), and the don't-remember flag. */
const authCookieName = /^(?:__Secure-)?better-auth[.-](?:session_token|session_data|dont_remember)(?:\.\d+)?$/;

/** The names among `names` that are Better Auth session cookies, to expire when the session is gone. */
export function authCookiesToExpire(names: Iterable<string>): string[] {
  return [...names].filter((name) => authCookieName.test(name));
}

/** Cache-Control for every response that depends on who is signed in: never stored by the CDN or the browser. */
export const privateNoStore = "private, no-store";
