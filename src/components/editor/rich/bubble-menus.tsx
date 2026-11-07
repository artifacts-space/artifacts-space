"use client";

import {
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconRowRemove,
  IconTableMinus,
} from "@tabler/icons-react";
import { findParentNode, type Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect, useRef } from "react";

import { FormatButtons, LinkEditor, ToolButton } from "./format-controls";
import { floatingMenuClass } from "./slash-menu";

interface TextBubbleMenuProps {
  editor: Editor;
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
}

/** True when a selection of text can take marks: not in code, not a whole block. */
function selectionTakesMarks(editor: Editor, from: number, to: number): boolean {
  if (from === to) return false;
  if (editor.state.selection instanceof NodeSelection) return false;
  return !editor.isActive("codeBlock");
}

/**
 * The menu over selected text: bold, italic, strikethrough, code, and link.
 * It turns into the link field while a link is edited. Hidden on touch
 * screens, which get the toolbar instead.
 */
export function TextBubbleMenu({ editor, linkOpen, onLinkOpenChange }: TextBubbleMenuProps) {
  const linkOpenRef = useRef(linkOpen);
  useEffect(() => {
    linkOpenRef.current = linkOpen;
    // ⌘K opens the link field even before the menu was showing.
    if (linkOpen) editor.view.dispatch(editor.state.tr.setMeta("textBubbleMenu", "show"));
  }, [editor, linkOpen]);
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="textBubbleMenu"
      shouldShow={({ editor: current, from, to }) => {
        if (linkOpenRef.current) return true;
        return current.isEditable && current.isFocused && selectionTakesMarks(current, from, to);
      }}
      options={{ placement: "top", offset: 8, flip: true, shift: { padding: 8 }, onHide: () => { onLinkOpenChange(false); } }}
      className={floatingMenuClass}
      role="toolbar"
      aria-label="Format text"
      data-slot="bubble-menu"
    >
      {linkOpen ? (
        <LinkEditor editor={editor} onDone={() => { onLinkOpenChange(false); }} />
      ) : (
        <div className="flex items-center gap-0.5">
          <FormatButtons editor={editor} onLink={() => { onLinkOpenChange(true); }} />
        </div>
      )}
    </BubbleMenu>
  );
}

/** The table around the cursor, as a box to place the table menu over. */
function tableReference(editor: Editor) {
  const table = findParentNode((node) => node.type.name === "table")(editor.state.selection);
  if (!table) return null;
  const dom = editor.view.nodeDOM(table.pos);
  if (!(dom instanceof HTMLElement)) return null;
  return { getBoundingClientRect: () => dom.getBoundingClientRect() };
}

/**
 * Row and column actions while the cursor is in a table: add above, below,
 * left, and right, and remove the row, the column, or the whole table.
 */
export function TableBubbleMenu({ editor }: { editor: Editor }) {
  const run = (action: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => () => { action(editor.chain().focus()).run(); };
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableBubbleMenu"
      shouldShow={({ editor: current, from, to }) => current.isEditable && current.isFocused && current.isActive("table") && from === to}
      getReferencedVirtualElement={() => tableReference(editor)}
      options={{ placement: "top-start", offset: 6, flip: true, shift: { padding: 8 } }}
      className={floatingMenuClass}
      role="toolbar"
      aria-label="Table"
      data-slot="table-menu"
    >
      <div className="flex items-center gap-0.5">
        <ToolButton icon={IconRowInsertTop} label="Add row above" onPress={run((chain) => chain.addRowBefore())} />
        <ToolButton icon={IconRowInsertBottom} label="Add row below" onPress={run((chain) => chain.addRowAfter())} />
        <ToolButton icon={IconColumnInsertLeft} label="Add column left" onPress={run((chain) => chain.addColumnBefore())} />
        <ToolButton icon={IconColumnInsertRight} label="Add column right" onPress={run((chain) => chain.addColumnAfter())} />
        <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
        <ToolButton icon={IconRowRemove} label="Remove row" onPress={run((chain) => chain.deleteRow())} />
        <ToolButton icon={IconColumnRemove} label="Remove column" onPress={run((chain) => chain.deleteColumn())} />
        <ToolButton icon={IconTableMinus} label="Remove table" onPress={run((chain) => chain.deleteTable())} />
      </div>
    </BubbleMenu>
  );
}
