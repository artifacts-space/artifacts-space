/*
 * Keeping a long-open page working: the rules for when the site asks for
 * the next files address of a page that is running, before the one in hand
 * ends (src/components/artifact-view/page-renewal.ts). An address works
 * for 10 to 15 minutes (pageTokenLimits); the page gets the next one
 * without loading again.
 *
 * Pure rules, safe for the server and the browser.
 */

/** How close to its end an address is renewed. */
export const passRenewal = {
  /** Renew this long before the end: time for the request, a retry, and a slow connection. */
  leadMs: 2 * 60_000,
  /**
   * And never earlier than the last quarter of the life the address had
   * when it arrived, so one that arrives with little time left is not
   * renewed the moment it is used.
   */
  lastShare: 4,
  /**
   * A hidden tab keeps renewing for this long after it was hidden, so a page
   * in a background tab (music, video) keeps loading its files. After that it
   * rests, and asks again only when the tab is shown. The limit is why an
   * abandoned tab never asks the server for ever.
   */
  hiddenMs: 60 * 60_000,
} as const;

/** The hidden allowance in words, for the guide and the docs: "one hour". */
export function hiddenAllowanceWords(): string {
  const minutes = passRenewal.hiddenMs / 60_000;
  if (minutes % 60 !== 0) return `${String(minutes)} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? "one hour" : `${String(hours)} hours`;
}

/** The files address a running page holds: when it ends, and when to ask for the next one. Times in milliseconds. */
export interface HeldPass {
  endsAt: number;
  renewAt: number;
}

/** The address a page holds from `receivedAt` on: it is renewed close to its end (passRenewal). */
export function heldPass(endsAt: number, receivedAt: number): HeldPass {
  const life = Math.max(0, endsAt - receivedAt);
  return { endsAt, renewAt: endsAt - Math.min(passRenewal.leadMs, life / passRenewal.lastShare) };
}

/** What to do about the address in hand right now. */
export type RenewStep =
  /** Nothing, and no timer: nothing to renew, or the tab has been hidden longer than its allowance (passRenewal.hiddenMs). */
  | { do: "rest" }
  /** One timer, set from the known time: ask when it fires. */
  | { do: "wait"; delayMs: number }
  /** Ask now: the address is close to its end, or has ended. */
  | { do: "ask" };

/**
 * The one decision, taken when an address arrives, when the tab is shown or
 * hidden, and when the timer fires. `hiddenSince` is when the tab was hidden,
 * or null while it is shown. A shown tab waits, on a single timer, for the
 * time to renew, and asks at once when the address is close to its end or
 * has ended. A tab hidden for less than `passRenewal.hiddenMs` does the same.
 * Past that it rests, with no timer and no request, and asks at once when it
 * is shown again (a new hour starts the next time it is hidden). The hour is
 * judged from `now`, so a timer that fires late, as browsers delay the
 * timers of hidden tabs, never asks after it. A hidden tab whose renewal
 * time falls after its hour holds no timer. Nothing here repeats on an
 * interval.
 */
export function renewStep(pass: HeldPass | null, hiddenSince: number | null, now: number): RenewStep {
  if (!pass) return { do: "rest" };
  if (hiddenSince !== null) {
    const hourEnds = hiddenSince + passRenewal.hiddenMs;
    if (now >= hourEnds || pass.renewAt >= hourEnds) return { do: "rest" };
  }
  return now >= pass.renewAt ? { do: "ask" } : { do: "wait", delayMs: pass.renewAt - now };
}

/** What the server's answer to a renewal means for the page. */
export type RenewalOutcome =
  /** A later address: hand it to the page, and wait for its own time to renew. */
  | { kind: "renewed"; token: string; pass: HeldPass }
  /** No address: the reader may not read the artifact any more, or none could be made. The page keeps running without its files, and is not asked for again. */
  | { kind: "refused" }
  /** The same address, or an earlier one: nothing to hand over. Asked again only when the tab is next shown. */
  | { kind: "same" };

/** Reads the answer to a renewal against the address in hand. Only an address that ends later counts as new, so an answer never sets a second timer for the same address. */
export function renewalOutcome(current: HeldPass, answer: { token: string; expiresAt: string } | null, now: number): RenewalOutcome {
  if (!answer) return { kind: "refused" };
  const endsAt = Date.parse(answer.expiresAt);
  if (!Number.isFinite(endsAt) || endsAt <= current.endsAt) return { kind: "same" };
  return { kind: "renewed", token: answer.token, pass: heldPass(endsAt, now) };
}
