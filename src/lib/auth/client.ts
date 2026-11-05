"use client";

import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser auth client. It talks to this app's /api/auth route. */
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
