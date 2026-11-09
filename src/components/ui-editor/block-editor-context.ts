"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

import type { UiSpec } from "@/lib/ui/spec";
import type { RawSpec } from "@/lib/ui/spec-blocks";

/** Where the insert menu puts the block it adds. */
export type InsertTarget =
  | { kind: "after"; key: string }
  /** An empty line turned into the chosen block in place. */
  | { kind: "replace"; key: string }
  | { kind: "end"; parent: string };

/** The result of a structural change: the new spec, and a block whose first text field takes focus once it renders. */
export interface BlockChange {
  spec: RawSpec;
  focus?: string | undefined;
}

/** The block editor's shared state and actions, for every block in the tree. */
export interface BlockEditor {
  /** The spec as the renderer reads it (normalized). */
  spec: UiSpec;
  /**
   * Applies a structural change (insert, move, duplicate, delete). The result
   * is checked with the same validation as artifacts_validate; a change that
   * would make the spec invalid is refused and returns false.
   */
  apply: (change: (raw: RawSpec) => BlockChange | null) => boolean;
  /** Changes one prop as someone types. Autosave holds a value that breaks the spec (see draftProblem). */
  setProp: (key: string, name: string, value: unknown) => void;
  openInsert: (target: InsertTarget, anchor: HTMLElement) => void;
  /** Takes the pending focus request when it names `key`; true when the caller should focus. */
  takeFocus: (key: string) => boolean;
  /** The block being dragged, if any. */
  dragging: DraggedBlock;
  /** The block showing its handle: the one under the pointer or holding focus. */
  active: ActiveBlockStore;
}

export const BlockEditorContext = createContext<BlockEditor | null>(null);

/** The block editor around a block. Blocks render only inside UiBlockEditor. */
export function useBlockEditor(): BlockEditor {
  const editor = useContext(BlockEditorContext);
  if (!editor) throw new Error("useBlockEditor must be used inside UiBlockEditor.");
  return editor;
}

/** Which block is being dragged: set on drag start, cleared on drop or drag end. */
export interface DraggedBlock {
  get: () => string | null;
  set: (key: string | null) => void;
}

/** A new dragged-block holder. */
export function createDraggedBlock(): DraggedBlock {
  let current: string | null = null;
  return { get: () => current, set: (key) => { current = key; } };
}

/** A tiny store for the active block, so moving the pointer re-renders two handles, not the whole tree. */
export interface ActiveBlockStore {
  get: () => string | null;
  set: (key: string | null) => void;
  subscribe: (listener: () => void) => () => void;
}

/** A new active-block store. */
export function createActiveBlockStore(): ActiveBlockStore {
  let current: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (key) => {
      if (key === current) return;
      current = key;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** True while `key` is the active block. */
export function useIsActiveBlock(key: string): boolean {
  const { active } = useBlockEditor();
  return useSyncExternalStore(active.subscribe, () => active.get() === key, () => false);
}
