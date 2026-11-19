"use client";

import { magicLinkClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * `fetch` as it is when a request is sent. Better Auth otherwise keeps the
 * function it finds when this module loads. The sign-in link's bot check
 * (src/lib/abuse/bot-check-client.ts) replaces window.fetch later, when the
 * sign-in form mounts, and adds the browser's proof there: a request sent
 * through the function from before carries no proof, and the server refuses
 * it for every person (#252 shipped that way and was rolled back).
 */
const fetchWhenSent: typeof fetch = (input, init) => globalThis.fetch(input, init);

/** Browser auth client. It talks to this app's /api/auth route. Organizations are teams. */
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), organizationClient()],
  fetchOptions: { customFetchImpl: fetchWhenSent },
});
