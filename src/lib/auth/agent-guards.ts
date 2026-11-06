import { APIError } from "better-auth/api";

import { isAgentEmail } from "@/lib/agents/identity";
import { isAgentUser } from "@/lib/agents/queries";

/**
 * Agents never sign in to the web app. They have no account rows (no GitHub
 * link, no password), their email is on the unroutable `.invalid` domain, and
 * these guards refuse the rest: no session is ever created for an agent, and
 * nobody can sign up with an agent email.
 */

/** Refuses a new user whose email is in the reserved agent domain. */
export function assertNotAgentEmail(email: unknown) {
  if (isAgentEmail(email)) throw new APIError("BAD_REQUEST", { message: "This email address cannot be used to sign in." });
}

/** Better Auth session hooks: refuse to create a session for an agent. */
export const sessionHooks = {
  create: {
    before: async (session: { userId: string }) => {
      if (await isAgentUser(session.userId)) throw new APIError("FORBIDDEN", { message: "Agents cannot sign in. Use the agent's API token." });
    },
  },
};

/** Team hook guard: agents belong to exactly one team, as a member, and their role never changes. */
export async function assertMemberIsNotAgent(userId: string, action: string) {
  if (await isAgentUser(userId)) throw new APIError("BAD_REQUEST", { message: `Agents cannot ${action}. Manage them in the team's Agents section.` });
}
