import { AUTOSAVE_DELAY_MS, AUTOSAVE_MAX_WAIT_MS } from "./autosave-rules";

/**
 * How long after the last autosave the page asks the server for itself
 * again: longer than the longest gap between two autosaves while typing goes
 * on (autosave-rules.ts), so nothing is rendered until the typing stops.
 */
export const QUIET_REFRESH_MS = AUTOSAVE_MAX_WAIT_MS + AUTOSAVE_DELAY_MS;

/**
 * When a page asks the server for itself after saves, kept apart from React
 * so it is tested without a browser. `run(leaving)` does the asking.
 * `soon`: once, QUIET_REFRESH_MS after the last call. `now`: at once, and
 * instead of one still owed. `leave`: at once when one is still owed (the
 * page is going away), else nothing.
 */
export function quietRefresher(run: (leaving: boolean) => void, delayMs: number = QUIET_REFRESH_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel(): boolean {
    if (timer === null) return false;
    clearTimeout(timer);
    timer = null;
    return true;
  }

  return {
    soon() {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        run(false);
      }, delayMs);
    },
    now() {
      cancel();
      run(false);
    },
    leave() {
      if (cancel()) run(true);
    },
  };
}
