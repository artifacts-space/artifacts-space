import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

import {
  hasPasswordLogin,
  isAllowedPasswordSignInBody,
  isClosedPasswordRoute,
  passwordAccountNotLinkable,
  passwordSignInPath,
  passwordWriteProblem,
} from "@/lib/auth/password-sign-in-rules";

/**
 * Locks for password sign-in (password-sign-in-rules.ts). A Better Auth
 * plugin, so it runs on the HTTP route and on direct server calls alike:
 * every route that would create, set, change, reset, or check a password
 * answers "not found", and a sign-in request may carry only an email, a
 * password, and where to go next.
 */
export function passwordSignInGuard() {
  return {
    id: "password-sign-in-guard",
    hooks: {
      before: [
        {
          matcher: (context) => isClosedPasswordRoute(context.path),
          handler: createAuthMiddleware(() => Promise.reject(new APIError("NOT_FOUND", { message: "Not found" }))),
        },
        {
          matcher: (context) => context.path === passwordSignInPath,
          handler: createAuthMiddleware((ctx) => {
            if (isAllowedPasswordSignInBody(ctx.body)) return Promise.resolve();
            return Promise.reject(new APIError("BAD_REQUEST", { code: "INVALID_SIGN_IN_REQUEST", message: "Enter your email and password." }));
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

/** The parts of Better Auth's endpoint context the link check reads. */
interface AccountReader {
  context: { internalAdapter: { findAccounts: (userId: string) => Promise<{ providerId: string }[]> } };
}

/** What Better Auth's `user.validateUserInfo` gate is told, as far as the link check needs. */
interface IncomingLink {
  user: { id?: unknown };
  source: { action?: string | undefined };
}

/**
 * Refuses a GitHub or Google login that would join an account with a
 * password, at sign-in (implicit linking by email) and from Settings
 * (`/link-social`) alike. Password accounts are test logins the owner
 * created; nobody else may sign into one with an outside login, even one
 * that verified the same address. Returns undefined for everything else.
 */
export async function passwordAccountLinkProblem(data: IncomingLink, ctx: AccountReader): Promise<typeof passwordAccountNotLinkable | undefined> {
  if (data.source.action !== "link-account") return undefined;
  if (typeof data.user.id !== "string" || !data.user.id) return passwordAccountNotLinkable;
  const accounts = await ctx.context.internalAdapter.findAccounts(data.user.id);
  return hasPasswordLogin(accounts) ? passwordAccountNotLinkable : undefined;
}

/** Throws when Better Auth is about to write a password login or a password (passwordWriteProblem). */
export function assertNoPasswordWrite(account: { providerId?: unknown; password?: unknown }) {
  const problem = passwordWriteProblem(account);
  if (problem) throw new APIError("FORBIDDEN", { code: "PASSWORD_WRITE_REFUSED", message: problem });
}
