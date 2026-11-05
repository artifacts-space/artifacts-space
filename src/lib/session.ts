import { headers } from "next/headers";
import { cache } from "react";

import { getAuth } from "@/lib/auth";

export const getSession = cache(async () => {
  const requestHeaders = await headers();
  return getAuth().api.getSession({
    headers: requestHeaders,
  });
});
