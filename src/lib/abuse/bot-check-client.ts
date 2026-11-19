import { initBotId } from "botid/client/core";
import { useEffect } from "react";

import { signInLinkProtection } from "@/lib/abuse/bot-check-rules";

let started = false;

/**
 * Starts the host's bot check in this browser, once: from then on the request
 * for a sign-in link carries the browser's proof. Only the sign-in form calls
 * it, and only where the page says the check exists (`botCheckRuns`): it
 * fetches the host's script before the request, so anywhere else that script
 * is missing and the request would fail. It does nothing on the server or in
 * development, and a failure to start is left to the server, which then
 * refuses the request with its own message.
 */
export function startSignInLinkBotCheck(): void {
  if (started || typeof window === "undefined") return;
  try {
    initBotId({ protect: signInLinkProtection });
    // Only once it started: a start that threw is tried again when the form next mounts.
    started = true;
  } catch (error) {
    console.error("[auth] Bot check did not start", error instanceof Error ? error.name : "unknown error");
  }
}

/** Starts the check once the sign-in form is on the page, when the page says the check exists here. */
export function useSignInLinkBotCheck(enabled: boolean): void {
  useEffect(() => {
    if (enabled) startSignInLinkBotCheck();
  }, [enabled]);
}
