import { AsyncLocalStorage } from "node:async_hooks";

import { type APIError, isAPIError } from "better-auth/api";

import { UNDELIVERABLE_ADDRESS_CODE } from "@/lib/auth/undeliverable-address";
import { INVITATION_BUDGET_CODE } from "@/lib/email/budget-rules";

/**
 * Carries a refused invitation email out of Better Auth. Better Auth 1.7
 * runs `sendInvitationEmail` through `runInBackgroundOrAwait`, which logs and
 * swallows whatever it throws, so `createInvitation` returns as if the email
 * went out. The teams plugin notes a refusal here (an APIError from
 * sendTeamInvitationEmail: an address that cannot receive mail, or the daily
 * budget), and the caller that wrapped the call reads it back. The note lives
 * only for the one call it wraps.
 *
 * This works only while Better Auth awaits the send inside the call. With
 * `advanced.backgroundTasks.handler` set, the email is sent after the call
 * returns, the refusal is noted too late, and the inviter is told the
 * invitation went out. Do not set that handler without moving this hand-off.
 */

/** The refusals the inviter is told about. Any other error from the send stays swallowed, as before. */
const refusalCodes: ReadonlySet<string> = new Set([UNDELIVERABLE_ADDRESS_CODE, INVITATION_BUDGET_CODE]);

/** True when `error` is one of the two refusals to show: an address that cannot receive mail, or the daily budget. */
export function isInvitationSendRefusal(error: unknown): error is APIError {
  if (!isAPIError(error)) return false;
  const code: unknown = error.body?.code;
  return typeof code === "string" && refusalCodes.has(code);
}


interface SendOutcome {
  refusal: APIError | null;
}

const outcomes = new AsyncLocalStorage<SendOutcome>();

/** Notes `error` when it is a refusal to show and a caller is listening. Anything else is ignored. */
export function noteInvitationSendRefusal(error: unknown): void {
  const outcome = outcomes.getStore();
  if (!outcome || !isInvitationSendRefusal(error)) return;
  outcome.refusal = error;
}

/** Runs `call` and returns its result with the refusal the invitation email met inside it, if any. */
export async function withInvitationSendRefusal<T>(call: () => Promise<T>): Promise<{ result: T; refusal: APIError | null }> {
  const outcome: SendOutcome = { refusal: null };
  const result = await outcomes.run(outcome, call);
  return { result, refusal: outcome.refusal };
}
