"use client";

import { useStateStore } from "@json-render/react";
import { useEffect, useRef, useState, type RefObject } from "react";

/** The state of one interface, as the renderer's store hands it out. */
export type StateAccess = Pick<ReturnType<typeof useStateStore>, "get" | "set">;
type ActionHandlers = Record<string, (params: Record<string, unknown>) => void>;

/**
 * The `toggleState` action: flips the value at `statePath` between true and
 * false. Anything that is not true (false, unset, a string) becomes true. It
 * does nothing without a path or before the interface's state is connected.
 */
export function toggleState(state: StateAccess | null, params: Record<string, unknown>): void {
  const path: unknown = params.statePath;
  if (!state || typeof path !== "string" || !path) return;
  state.set(path, state.get(path) !== true);
}

/**
 * The actions an interface has beside the renderer's own (setState,
 * pushState, removeState, validateForm). Like those, each one only changes
 * the spec's own state. Pass `handlers` to the renderer's provider and
 * render `<StateActions accessRef={accessRef} />` once inside it. The
 * interface editor runs no actions, so it needs neither.
 *
 * The handlers are fixed from the first draw and reach the state through
 * `accessRef`, so a press never finds an action missing and adding them costs
 * no second draw of the interface.
 */
export function useStateActions(): { handlers: ActionHandlers; accessRef: RefObject<StateAccess | null> } {
  const accessRef = useRef<StateAccess | null>(null);
  const [handlers] = useState<ActionHandlers>(() => ({
    toggleState: (params) => {
      toggleState(accessRef.current, params);
    },
  }));
  return { handlers, accessRef };
}

/** Gives the handlers from `useStateActions` the state of the provider it is rendered in. */
export function StateActions({ accessRef }: { accessRef: RefObject<StateAccess | null> }) {
  const { get, set } = useStateStore();
  useEffect(() => {
    accessRef.current = { get, set };
    return () => {
      accessRef.current = null;
    };
  }, [accessRef, get, set]);
  return null;
}
