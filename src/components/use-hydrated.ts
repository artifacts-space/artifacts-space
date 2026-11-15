"use client";

import { useSyncExternalStore } from "react";

const neverChanges = () => () => undefined;

/**
 * False in the server's HTML and while the browser still shows it; true once
 * React has taken over this component. For a mark a test waits on before it
 * scans or writes on the page: what only the browser can add (a scrolling
 * box's tab stop, a measured size) is there from then on.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(neverChanges, () => true, () => false);
}
