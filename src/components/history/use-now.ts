import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

function subscribe() {
  // Nothing pushes updates; relative times refresh whenever the component renders.
  return () => undefined;
}

function currentMinute() {
  return Math.floor(Date.now() / MINUTE) * MINUTE;
}

function serverSnapshot() {
  return null;
}

/**
 * The current time to the minute in the browser, and null while rendering on
 * the server or hydrating, so relative times never cause a hydration mismatch.
 */
export function useNow(): Date | null {
  const now = useSyncExternalStore(subscribe, currentMinute, serverSnapshot);
  return now === null ? null : new Date(now);
}
