import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept current by the browser's change
 * event. The server and the first client render use `serverValue`, so the
 * markup hydrates without a mismatch.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => { list.removeEventListener("change", onChange); };
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => serverValue);
}
