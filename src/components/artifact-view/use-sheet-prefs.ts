"use client";

import { createContext, useCallback, useContext, useId, useMemo, useSyncExternalStore } from "react";

import { parseSheetPrefs, serializeSheetPrefs, type SheetPrefs, sheetPrefsKey } from "@/lib/sheet-column-rules";

/** The artifact a sheet belongs to, so each viewer's widths and order are kept per artifact. Without one they last for this visit only. */
export const SheetKeyContext = createContext<string | null>(null);

/** Prefs that could not be stored (no artifact, a private window, blocked or full storage) last until the page reloads. */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changing the same sheet's prefs.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Memory holds only writes storage refused, so it always wins over an older stored copy. */
function readText(storageKey: string, persistent: boolean): string | null {
  const unsaved = memory.get(storageKey);
  if (unsaved !== undefined || !persistent) return unsaved ?? null;
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeText(storageKey: string, persistent: boolean, text: string) {
  memory.set(storageKey, text);
  if (persistent) {
    try {
      window.localStorage.setItem(storageKey, text);
      // Stored: storage is the source again, so another tab's later change shows here.
      memory.delete(storageKey);
    } catch {
      // Kept in memory instead, until the page reloads.
    }
  }
  for (const listener of listeners) listener();
}

const serverText = () => null;

/**
 * One viewer's column widths and own column order for this sheet, kept in
 * this browser only (localStorage, per artifact, every access in a
 * try/catch). They are never saved to the artifact, so nobody else sees
 * them. On the server and while hydrating, the prefs are empty.
 */
export function useSheetPrefs(): [SheetPrefs, (change: (current: SheetPrefs) => SheetPrefs) => void] {
  const artifactKey = useContext(SheetKeyContext);
  const visitKey = useId();
  const persistent = artifactKey !== null;
  const storageKey = sheetPrefsKey(artifactKey ?? `visit:${visitKey}`);
  const text = useSyncExternalStore(subscribe, () => readText(storageKey, persistent), serverText);
  const prefs = useMemo(() => parseSheetPrefs(text), [text]);

  const update = useCallback((change: (current: SheetPrefs) => SheetPrefs) => {
    const next = change(parseSheetPrefs(readText(storageKey, persistent)));
    writeText(storageKey, persistent, serializeSheetPrefs(next));
  }, [storageKey, persistent]);

  return [prefs, update];
}
