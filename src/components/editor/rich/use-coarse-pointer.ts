"use client";

import { useSyncExternalStore } from "react";

const coarseQuery = "(pointer: coarse)";

function subscribeCoarse(onChange: () => void) {
  const query = window.matchMedia(coarseQuery);
  query.addEventListener("change", onChange);
  return () => { query.removeEventListener("change", onChange); };
}

/** True on touch screens: the toolbar replaces the menu over the selection, and block grips always show faintly. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, () => window.matchMedia(coarseQuery).matches, () => false);
}
