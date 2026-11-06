import { getSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";

import { getAuth } from "@/lib/auth/server";

/**
 * The signed-in session for this request, or null. Deduplicated per request.
 *
 * `connection()` comes first because Better Auth reads `new Date()` to check expiry.
 * With Partial Prefetching, `headers()` alone still resolves while the App Shell
 * prerenders, so the lookup would run there and trip the current-time prerender check.
 *
 * Visitors without a session cookie are signed out, so they skip Better Auth
 * (and its setup) entirely: anonymous artifact pages cost no session work.
 */
export const getSession = cache(async () => {
  await connection();
  const requestHeaders = await headers();
  if (!getSessionCookie(requestHeaders)) return null;
  return getAuth().api.getSession({ headers: requestHeaders });
});
