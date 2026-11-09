import type { NextRequest, NextResponse } from "next/server";

import { authCookiesToExpire, privateNoStore, type SessionDecision } from "@/lib/auth/entry-rules";
import { getAuth } from "@/lib/auth/server";

/** The real session check in the proxy: who is signed in, and the cookies Better Auth wants to set. */
export interface ProxySession {
  signedIn: boolean;
  /** Set-Cookie values from Better Auth: the refreshed 5-minute session cache and, once a day, the renewed session cookie. */
  setCookies: string[];
}

/**
 * Looks up the session for a proxy request. Most calls are answered from the
 * signed 5-minute cookie cache with no database query. Pages render as server
 * components, which cannot set cookies, so the proxy is where Better Auth's
 * refreshed cookies reach the browser. Throws when the lookup fails.
 */
export async function proxySession(request: NextRequest): Promise<ProxySession> {
  const { headers, response } = await getAuth().api.getSession({ headers: request.headers, returnHeaders: true });
  return { signedIn: Boolean(response?.user.id), setCookies: headers.getSetCookie() };
}

/** Adds Better Auth's Set-Cookie values to a proxy response. */
export function withSetCookies<T extends NextResponse>(response: T, setCookies: readonly string[]): T {
  for (const value of setCookies) response.headers.append("set-cookie", value);
  return response;
}

/**
 * Expires every Better Auth session cookie the request carries. A cookie with
 * the `__Secure-` prefix can only be changed by a Secure Set-Cookie, so the
 * flag follows the name.
 */
export function expireAuthCookies<T extends NextResponse>(request: NextRequest, response: T): T {
  const names = request.cookies.getAll().map((cookie) => cookie.name);
  for (const name of authCookiesToExpire(names)) {
    response.cookies.set(name, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: name.startsWith("__Secure-") });
  }
  return response;
}

/** Marks a response that depends on who is signed in, so no cache stores it. */
export function noStore<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", privateNoStore);
  return response;
}

/**
 * Applies a session decision: the redirect or the page, with the auth
 * cookies expired when the session is gone, and Better Auth's refreshed
 * cookies otherwise. Always private and uncached.
 */
export function applySessionDecision(request: NextRequest, decision: SessionDecision, session: ProxySession, pass: () => NextResponse, redirect: (to: string) => NextResponse): NextResponse {
  const response = decision.action === "redirect" ? redirect(decision.to) : pass();
  const withCookies = decision.expireCookies ? expireAuthCookies(request, response) : withSetCookies(response, session.setCookies);
  return noStore(withCookies);
}
