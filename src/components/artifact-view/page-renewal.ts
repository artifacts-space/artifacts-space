"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

import type { PageAddress } from "@/lib/page-files/address";
import { heldPass, renewalOutcome, renewStep, type HeldPass } from "@/lib/page-files/renew-rules";
import { askAgainOnFailure } from "@/lib/page-files/rules";
import { pageFramePath, pageMessages } from "@/lib/page-host/rules";

/** The files address a load of a page started on, and how to ask the server for the next one. */
export interface PagePass {
  /** When the address the frame loaded under ends, in milliseconds. */
  endsAt: number;
  /** Asks the server for this viewer's next address. Null when they may not read the artifact any more, or none could be made. */
  ask: () => Promise<PageAddress | null>;
}

interface Renewal {
  frameRef: RefObject<HTMLIFrameElement | null>;
  /** The page host's origin: the new address is posted to it only. */
  origin: string;
  /** Null for a page without page files: it has no address to renew. */
  pass: PagePass | null;
}

/**
 * Keeps a page that stays open working: gets the next files address from
 * the server before the one in hand ends, and hands it to the frame
 * document, which moves its own address to it (frame-document.ts). The
 * frame never loads again for this, so what the reader did in the page
 * stays.
 *
 * When it asks is one decision (renewStep), taken when an address arrives,
 * when the tab is shown or hidden, and when its timer fires: a shown tab
 * holds one timer, set from the address's known end. A hidden tab does the
 * same for one hour after it was hidden (passRenewal.hiddenMs), so a page
 * in a background tab keeps loading its files; after that hour it holds no
 * timer and asks nothing. A tab shown again with an address that ended or
 * is close to its end asks at once, and hiding it again starts a new hour.
 * Browsers slow the timers of hidden tabs, so every timer decides from the
 * clock when it fires, never from the delay it was set for. A refusal ends
 * it for this load: the page keeps running without its files. A request
 * that failed twice, or an answer that is no later address, waits for the
 * tab to be shown again or the browser to come back online. Nothing repeats
 * on an interval.
 *
 * Returns `resend`: posts the newest address again. The frame calls it when
 * the frame document loads again (a page that reloads itself starts at the
 * address the frame first loaded, which may have ended).
 */
export function usePassRenewal({ frameRef, origin, pass }: Renewal): () => void {
  const newestRef = useRef<string | null>(null);
  const post = useCallback((token: string) => {
    frameRef.current?.contentWindow?.postMessage({ type: pageMessages.renew, path: pageFramePath(token) }, origin);
  }, [frameRef, origin]);

  useEffect(() => {
    if (!pass) return undefined;
    const { ask } = pass;
    let held: HeldPass | null = heldPass(pass.endsAt, Date.now());
    let timer: number | null = null;
    let asking = false;
    // Set after an answer that brought nothing new: the next ask waits for the tab to be shown again, or the browser to come back online.
    let resting = false;
    let ended = false;
    // When the tab was hidden, or null while it is shown: the start of its hour of renewing in the background.
    let hiddenSince: number | null = document.visibilityState === "visible" ? null : Date.now();

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const take = (answer: PageAddress | null) => {
      if (ended || !held) return;
      const outcome = renewalOutcome(held, answer, Date.now());
      if (outcome.kind === "refused") held = null;
      if (outcome.kind === "same") resting = true;
      if (outcome.kind !== "renewed") return;
      held = outcome.pass;
      newestRef.current = outcome.token;
      post(outcome.token);
    };
    const settle = () => {
      clearTimer();
      if (ended || asking || resting) return;
      const step = renewStep(held, hiddenSince, Date.now());
      if (step.do === "wait") timer = window.setTimeout(settle, step.delayMs);
      if (step.do !== "ask") return;
      asking = true;
      // A request that fails on the way is sent once more; a refusal is an answer and is not.
      askAgainOnFailure(ask)
        .then(take, () => { resting = true; })
        .finally(() => {
          asking = false;
          settle();
        });
    };
    const wake = () => {
      resting = false;
      settle();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        hiddenSince = null;
        wake();
        return;
      }
      // A second "hidden" signal keeps the first moment: the hour starts once.
      hiddenSince ??= Date.now();
      settle();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", wake);
    settle();
    return () => {
      ended = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", wake);
    };
  }, [pass, post]);

  return useCallback(() => {
    if (newestRef.current !== null) post(newestRef.current);
  }, [post]);
}
