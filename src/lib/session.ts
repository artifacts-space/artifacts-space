import { headers } from "next/headers";
import { cache } from "react";

import { getAuth } from "@/lib/auth/server";

/** The signed-in session for this request, or null. Deduplicated per request. */
export const getSession = cache(async () => {
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
});
