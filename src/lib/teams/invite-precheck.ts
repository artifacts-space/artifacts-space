import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Marks a Better Auth createInvitation call whose invitation limits the
 * caller already checked and counted (inviteMemberAction), so the
 * beforeCreateInvitation hook does not count them a second time.
 *
 * The action must check first because Better Auth cancels an open
 * invitation to the same address before its hook runs, with no
 * transaction: a refusal in the hook would leave the old link canceled and
 * no new one. The marker lives only for the one call it wraps and names the
 * inviter and team it was checked for, so it never covers another call.
 */

interface PrecheckedInvite {
  inviterId: string;
  teamId: string;
}

const prechecked = new AsyncLocalStorage<PrecheckedInvite>();

/** Runs `call` with the marker for this inviter and team. */
export function withPrecheckedInvite<T>(scope: PrecheckedInvite, call: () => Promise<T>): Promise<T> {
  return prechecked.run(scope, call);
}

/** True only inside withPrecheckedInvite for exactly this inviter and team. */
export function wasPrechecked(inviterId: string, teamId: string): boolean {
  const scope = prechecked.getStore();
  return scope?.inviterId === inviterId && scope.teamId === teamId;
}
