import { useEffect } from "react";

/**
 * Asks the browser to confirm before the tab closes or reloads while
 * `active` is true, so unsaved edits are not lost by accident.
 */
export function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); };
  }, [active]);
}
