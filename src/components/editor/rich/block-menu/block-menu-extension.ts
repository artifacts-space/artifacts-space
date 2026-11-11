import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { shortcutFor, type BlockActionId } from "./block-actions";

/*
 * The editor side of the block menu: a quiet highlight on the block the menu
 * is open for (a decoration, so the document itself never changes), and the
 * menu's shortcuts while the cursor is in a block. The shortcuts call the
 * host the block controls register (setBlockMenuHost), which knows the page
 * (links, comments).
 */

/** What the shortcuts call: runs an action on the block at `pos`, and says whether it did. */
export interface BlockMenuHost {
  run: (id: BlockActionId, pos: number) => boolean;
}

/** The host each editor's block controls registered, once they mount. */
const hosts = new WeakMap<Editor, BlockMenuHost>();

/** Registers (or, with null, removes) what an editor's block shortcuts call. */
export function setBlockMenuHost(editor: Editor, host: BlockMenuHost | null): void {
  if (host) hosts.set(editor, host);
  else hosts.delete(editor);
}

interface BlockMenuOptions {
  /** Apple keys (⌘, ⌥) or the others (Ctrl, Alt). */
  mac: boolean;
}

const targetKey = new PluginKey<number | null>("blockMenuTarget");

/** Where the highlighted block starts, kept in place as the document changes, or null. */
function nextTarget(value: number | null, tr: Transaction): number | null {
  const meta: unknown = tr.getMeta(targetKey);
  if (meta !== undefined) return typeof meta === "number" ? meta : null;
  if (value === null || !tr.docChanged) return value;
  const mapped = tr.mapping.mapResult(value, 1);
  return mapped.deleted ? null : mapped.pos;
}

function targetDecorations(state: EditorState): DecorationSet | null {
  const pos = targetKey.getState(state);
  if (pos === null || pos === undefined) return null;
  const node = state.doc.nodeAt(pos);
  if (!node) return null;
  return DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, { class: "block-menu-target" })]);
}

const targetPlugin = new Plugin<number | null>({
  key: targetKey,
  state: { init: () => null, apply: (tr, value) => nextTarget(value, tr) },
  props: { decorations: targetDecorations },
});

/** Highlights the block at `pos` while its menu is open, or clears the highlight with null. */
export function setMenuTarget(view: EditorView, pos: number | null): void {
  if (view.isDestroyed) return;
  view.dispatch(view.state.tr.setMeta(targetKey, pos).setMeta("addToHistory", false));
}

const shortcutActions: readonly BlockActionId[] = ["copyLink", "duplicate", "moveUp", "moveDown", "comment"];

/** The block menu's highlight and shortcuts. Configure it with the platform's keys. */
export const BlockMenuExtension = Extension.create<BlockMenuOptions>({
  name: "blockMenu",

  addOptions() {
    return { mac: false };
  },

  addProseMirrorPlugins() {
    return [targetPlugin];
  },

  addKeyboardShortcuts() {
    const editor = this.editor;
    return Object.fromEntries(
      shortcutActions.map((id) => [shortcutFor(id, this.options.mac).binding, () => hosts.get(editor)?.run(id, editor.state.selection.from) ?? false]),
    );
  },
});
