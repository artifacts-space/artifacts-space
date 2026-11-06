"use client";

import { magicLinkClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser auth client. It talks to this app's /api/auth route. Organizations are teams. */
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), organizationClient()],
});
