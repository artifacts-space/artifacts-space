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
 */
export const getSession = cache(async () => {
  await connection();
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
});
