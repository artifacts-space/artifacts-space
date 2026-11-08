import { containerComponents, isUiComponentName } from "@/lib/ui/catalog";
import {
  childrenOf,
  deleteBlock,
  duplicateBlock,
  insertBlock,
  nudgeBlock,
  placeOf,
  replaceBlock,
  withContainerRoot,
  type NewBlock,
  type RawSpec,
} from "@/lib/ui/spec-blocks";

import type { BlockChange, InsertTarget } from "./block-editor-context";

/**
 * The editor's block commands as pure functions over the raw spec, each
 * returning the new spec and the block to focus next, or null when the
 * command does not apply (such as moving the first block up).
 */

/** An empty line of text: what Enter adds below a block. */
export const emptyText = (): NewBlock => ({ element: { type: "Text", props: { text: "" } } });

/** True for components that hold other blocks. */
export function isContainerType(type: string): boolean {
  return isUiComponentName(type) && containerComponents.has(type);
}

/** Adds `block` right after `key`, and focuses it. */
export function addAfter(raw: RawSpec, key: string, block: NewBlock): BlockChange | null {
  const place = placeOf(raw, key);
  if (!place) return addAtEnd(raw, raw.root, block);
  const inserted = insertBlock(raw, place.parent, place.index + 1, block);
  return inserted ? { spec: inserted.spec, focus: inserted.key } : null;
}

/** Adds `block` as the last child of `parent`; at the page's end, a single-block root first becomes a stack. */
export function addAtEnd(raw: RawSpec, parent: string, block: NewBlock): BlockChange | null {
  const spec = parent === raw.root ? withContainerRoot(raw, isContainerType) : raw;
  const target = parent === raw.root ? spec.root : parent;
  const inserted = insertBlock(spec, target, childrenOf(spec, target).length, block);
  return inserted ? { spec: inserted.spec, focus: inserted.key } : null;
}

/** Puts the chosen block where the insert menu was opened. */
export function insertAt(raw: RawSpec, target: InsertTarget, block: NewBlock): BlockChange | null {
  if (target.kind === "end") return addAtEnd(raw, target.parent, block);
  if (target.kind === "after") return addAfter(raw, target.key, block);
  const replaced = replaceBlock(raw, target.key, block);
  return replaced ? { spec: replaced, focus: target.key } : null;
}

/** Removes `key` and focuses the block before it, if any. */
export function removeBlock(raw: RawSpec, key: string): BlockChange | null {
  const place = placeOf(raw, key);
  const spec = deleteBlock(raw, key);
  if (!spec) return null;
  const before = place && place.index > 0 ? childrenOf(raw, place.parent)[place.index - 1] : undefined;
  return { spec, focus: before };
}

/** Duplicates `key` below itself and focuses the copy. */
export function duplicate(raw: RawSpec, key: string): BlockChange | null {
  const copied = duplicateBlock(raw, key);
  return copied ? { spec: copied.spec, focus: copied.key } : null;
}

/** Moves `key` one place up or down among its siblings. */
export function nudge(raw: RawSpec, key: string, step: -1 | 1): BlockChange | null {
  const spec = nudgeBlock(raw, key, step);
  return spec ? { spec } : null;
}
