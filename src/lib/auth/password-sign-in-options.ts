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
 * A sign-in answer without its `token`: the session lives in the httpOnly
 * cookie, so the page never needs it and script on the page never sees it.
 * Null when the answer is not a body with a token (an error, for one).
 */
export function withoutSessionToken(returned: unknown): Record<string, unknown> | null {
  if (typeof returned !== "object" || returned === null || returned instanceof Error || !("token" in returned)) return null;
  return Object.fromEntries(Object.entries(returned).filter(([key]) => key !== "token"));
}

/**
 * Locks for password sign-in (password-sign-in-rules.ts). A Better Auth
 * plugin, so it runs on the HTTP route and on direct server calls alike:
 * every route that would create, set, change, reset, or check a password
 * answers "not found", a sign-in request may carry only an email, a
 * password, and where to go next, and its answer leaves out the session
 * token (withoutSessionToken).
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
      after: [
        {
          matcher: (context) => context.path === passwordSignInPath,
          handler: createAuthMiddleware((ctx) => {
            const body = withoutSessionToken(ctx.context.returned);
            return Promise.resolve(body ? ctx.json(body) : undefined);
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

/** The part of Better Auth's endpoint context that finds a user by email with their logins. */
interface UserFinder {
  context: { internalAdapter: { findUserByEmail: (email: string, options: { includeAccounts: true }) => Promise<{ accounts: { providerId: string }[] } | null> } };
}

/**
 * Wraps the sign-in link sender so an address with a password login gets no
 * link, silently: Better Auth still answers exactly as for any address, so
 * the answer says nothing about the account. Password accounts sign in only
 * with their password; the owner's reset script is their recovery. Without
 * an endpoint context the link is sent as before.
 */
export function skipLinksForPasswordAccounts<T extends { email: string }>(send: (data: T) => Promise<void>) {
  return async (data: T, ctx?: UserFinder): Promise<void> => {
    const found = ctx ? await ctx.context.internalAdapter.findUserByEmail(data.email.toLowerCase(), { includeAccounts: true }) : null;
    if (found && hasPasswordLogin(found.accounts)) return;
    await send(data);
  };
}
