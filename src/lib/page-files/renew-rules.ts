/*
 * Keeping a long-open page working: the rules for when the site asks for
 * the next files address of a page that is running, before the one in hand
 * ends (src/components/artifact-view/page-renewal.ts). An address works
 * for 10 to 15 minutes (pageTokenLimits); the page gets the next one
 * without loading again.
 *
 * Every time here is on the browser's own clock. The server tells a browser
 * how long an address still works (`lifeMs`, measured on the server), and
 * the browser holds the address until that long after the answer reached
 * it. It never compares the server's time of day with its own, so a device
 * whose clock is an hour ahead or behind renews at the same moments as one
 * that is right.
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
  /**
   * An answer is taken as a later address only when the next renewal is at
   * least this far away. A shorter wait would start a new ask at once, so
   * an answer can never set off a loop.
   */
  minWaitMs: 60_000,
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

/**
 * When an address ends on this browser's clock: `lifeMs` after `receivedAt`,
 * the moment its answer reached the browser (`Date.now()` there). The wait
 * the answer took only makes this a little late, which the lead covers.
 * A `lifeMs` that is missing, not a number, or not positive counts as no
 * life: the address has ended already.
 */
export function endOnThisClock(lifeMs: number, receivedAt: number): number {
  return receivedAt + (Number.isFinite(lifeMs) && lifeMs > 0 ? lifeMs : 0);
}

/** The address a page holds from `receivedAt` on, with its end on this browser's clock (endOnThisClock): it is renewed close to its end (passRenewal). */
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
  /** Nothing to hand over: the same address, an address that does not end later, or one that gives no real wait. Asked again only when the tab is next shown or the browser comes back online. */
  | { kind: "same" };

/**
 * Reads the answer to a renewal against the address in hand (`currentToken`,
 * and `current` for when it ends on this clock). The server makes the same
 * token for the same page within one step, so an answer with the token in
 * hand is the same address. A different token counts as new only when its
 * life is a number above zero, it ends later than the one in hand on this
 * clock, and its own renewal is at least `passRenewal.minWaitMs` away. An
 * answer that fails any of these is "same", never "renewed": handing over
 * an address that is due again at once would make the page ask again at
 * once, and keep asking until the hourly limit refused it. Nothing here
 * reads the server's time of day.
 */
export function renewalOutcome(current: HeldPass, currentToken: string, answer: { token: string; lifeMs: number } | null, now: number): RenewalOutcome {
  if (!answer) return { kind: "refused" };
  if (answer.token === currentToken) return { kind: "same" };
  const pass = heldPass(endOnThisClock(answer.lifeMs, now), now);
  if (pass.endsAt <= current.endsAt || pass.renewAt - now < passRenewal.minWaitMs) return { kind: "same" };
  return { kind: "renewed", token: answer.token, pass };
}
