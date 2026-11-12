import { AsyncLocalStorage } from "node:async_hooks";

import { type APIError, isAPIError } from "better-auth/api";

/**
 * Carries a refused invitation email out of Better Auth. Better Auth 1.7
 * runs `sendInvitationEmail` through `runInBackgroundOrAwait`, which logs and
 * swallows whatever it throws, so `createInvitation` returns as if the email
 * went out. The teams plugin notes a refusal here (an APIError from
 * sendTeamInvitationEmail: an address that cannot receive mail, or the daily
 * budget), and the caller that wrapped the call reads it back. The note lives
 * only for the one call it wraps.
 */

interface SendOutcome {
  refusal: APIError | null;
}

const outcomes = new AsyncLocalStorage<SendOutcome>();

/** Notes `error` when it is a refusal to show and a caller is listening. Anything else is ignored. */
export function noteInvitationSendRefusal(error: unknown): void {
  const outcome = outcomes.getStore();
  if (!outcome || !isAPIError(error)) return;
  outcome.refusal = error;
}

/** Runs `call` and returns its result with the refusal the invitation email met inside it, if any. */
export async function withInvitationSendRefusal<T>(call: () => Promise<T>): Promise<{ result: T; refusal: APIError | null }> {
  const outcome: SendOutcome = { refusal: null };
  const result = await outcomes.run(outcome, call);
  return { result, refusal: outcome.refusal };
}
