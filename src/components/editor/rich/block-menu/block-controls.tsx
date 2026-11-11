"use client";

import type { AnyExtension, Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import { useCoarsePointer } from "../use-coarse-pointer";
import { isApplePlatform, type MenuCommand, type MenuContext } from "./block-actions";
import { changeBlockType, insertBelow, runBlockAction } from "./block-commands";
import { endBlockDrag, startBlockDrag } from "./block-drag";
import { BlockHandle } from "./block-handle";
import { BlockMenu, type MenuCloseReason } from "./block-menu";
import { useBlockMenuPage, type BlockMenuPage } from "./block-menu-context";
import { BlockMenuExtension, setBlockMenuHost, setMenuTarget } from "./block-menu-extension";
import { blockCounts, blockShape, blockTargetAt, blockTargetFrom, canMoveBlock, documentBlocks } from "./block-target";
import { blockTypeName, currentBlockType } from "./block-types";
import { useBlockPlaces, useEditorState, useHoveredBlock } from "./use-block-places";
import type { MenuAnchor } from "./use-floating-menu";

interface OpenMenu {
  pos: number;
  anchor: MenuAnchor;
  grip: HTMLElement | null;
}

/** What the menu shows for the block at `pos`, or null when no block starts there any more. */
function menuView(doc: PMNode, pos: number, page: BlockMenuPage | null) {
  const target = blockTargetFrom(doc, pos);
  if (!target) return null;
  const shape = blockShape(doc, target);
  const current = currentBlockType(shape);
  const mediaKind: unknown = target.node.attrs.kind;
  const context: MenuContext = {
    changeable: current !== null,
    currentType: current?.id ?? null,
    canMoveUp: canMoveBlock(doc, target, -1),
    canMoveDown: canMoveBlock(doc, target, 1),
    canLink: Boolean(page?.publicId),
    canComment: Boolean(page?.publicId) && page?.canComment === true,
  };
  return { context, typeName: blockTypeName(shape, typeof mediaKind === "string" ? mediaKind : undefined), counts: blockCounts(target.node) };
}

/** The block's own element in the editor, or null when no element starts at `pos`. */
function blockElement(editor: Editor, pos: number): HTMLElement | null {
  const dom = editor.view.nodeDOM(pos);
  return dom instanceof HTMLElement ? dom : null;
}

/** The whole handle ("+" and the grip) a grip sits in: the menu opens beside it, so it never covers "+". */
function handleOf(grip: HTMLElement): HTMLElement {
  return grip.closest<HTMLElement>("[data-slot=block-handle]") ?? grip;
}

/** Right-clicks that keep the browser's own menu: on touch, over selected text, and on links, media, and fields. */
function keepsNativeMenu(editor: Editor, event: MouseEvent, touch: boolean): boolean {
  if (touch) return true;
  const { selection } = editor.state;
  if (!selection.empty && !(selection instanceof NodeSelection)) return true;
  return event.target instanceof Element && event.target.closest("a, input, textarea, select, video, audio, iframe") !== null;
}

/** Where a right-click opens the menu: at the pointer, or at the cursor when the keyboard's menu key opened it. */
function contextAnchor(editor: Editor, event: MouseEvent): { pos: number; anchor: MenuAnchor } | null {
  const fromKeyboard = event.clientX === 0 && event.clientY === 0;
  const coords = fromKeyboard ? editor.view.coordsAtPos(editor.state.selection.from) : { left: event.clientX, top: event.clientY };
  const found = fromKeyboard ? { pos: editor.state.selection.from, inside: -1 } : editor.view.posAtCoords(coords);
  if (!found) return null;
  const target = blockTargetAt(editor.state.doc, found.inside >= 0 ? found.inside : found.pos);
  const element = target ? editor.view.nodeDOM(target.pos) : null;
  if (!target || !(element instanceof HTMLElement)) return null;
  const box = element.getBoundingClientRect();
  return { pos: target.pos, anchor: { kind: "point", element, dx: coords.left - box.left, dy: coords.top - box.top } };
}

/** Opens the block menu on right-click (and the keyboard's menu key) inside the document. */
function useContextMenu(editor: Editor, touch: boolean, open: (pos: number, anchor: MenuAnchor) => void) {
  useEffect(() => {
    const dom = editor.view.dom;
    const onContextMenu = (event: MouseEvent) => {
      if (keepsNativeMenu(editor, event, touch)) return;
      const at = contextAnchor(editor, event);
      if (!at) return;
      event.preventDefault();
      open(at.pos, at.anchor);
    };
    dom.addEventListener("contextmenu", onContextMenu);
    return () => { dom.removeEventListener("contextmenu", onContextMenu); };
  }, [editor, touch, open]);
}

/** Registers what the editor's shortcuts call (block-menu-extension.ts). */
function useShortcutHost(editor: Editor, page: BlockMenuPage | null) {
  useEffect(() => {
    setBlockMenuHost(editor, {
      run: (id, pos) => {
        const target = blockTargetAt(editor.state.doc, pos);
        return target ? runBlockAction(editor, target.pos, id, page) : false;
      },
    });
    return () => { setBlockMenuHost(editor, null); };
  }, [editor, page]);
}

/** The positions that get a handle: every block on touch screens; the open or hovered one otherwise. */
function handlePositions(doc: PMNode, touch: boolean, shown: number | null): number[] {
  if (touch) return documentBlocks(doc).map((block) => block.pos);
  return shown === null ? [] : [shown];
}

interface BlockControlsProps {
  editor: Editor;
  /** The positioned box around the document that the handles are placed in. */
  frame: RefObject<HTMLDivElement | null>;
}

/**
 * Block handles and the block menu for the rich editor: a handle beside the
 * hovered block (beside every block, faintly, on touch screens), the menu
 * from the grip or a right-click, dragging by the grip, and the shortcuts.
 * Only editors on an artifact page (BlockMenuFor) get them.
 */
function BlockControls({ editor, frame }: BlockControlsProps) {
  const page = useBlockMenuPage();
  const touch = useCoarsePointer();
  const mac = useMemo(() => isApplePlatform(), []);
  const state = useEditorState(editor);
  const [hovered, setHovered] = useHoveredBlock(editor, !touch);
  const [opened, setMenu] = useState<OpenMenu | null>(null);
  const focusGrip = useRef<number | null>(null);
  const gripRef = useRef<HTMLButtonElement>(null);
  const openedPos = opened?.pos ?? null;
  // Read again when the document changes, so Move up and Move down know where the block now is. A menu whose block is gone (undone) is closed.
  const view = useMemo(() => (openedPos === null ? null : menuView(state.doc, openedPos, page)), [openedPos, state.doc, page]);
  const menu = view ? opened : null;
  const shown = menu?.pos ?? hovered;
  const places = useBlockPlaces(editor, frame, handlePositions(state.doc, touch, shown), state.doc, touch);

  const open = useCallback((pos: number, anchor: MenuAnchor, grip: HTMLElement | null = null) => {
    setMenu({ pos, anchor, grip });
    setMenuTarget(editor.view, pos);
  }, [editor]);

  const close = useCallback((reason: MenuCloseReason | "command") => {
    const pos = menu?.pos ?? null;
    setMenu(null);
    setMenuTarget(editor.view, null);
    if (reason !== "escape" || pos === null) return;
    // Escape returns focus to the block's grip, which stays shown for it.
    setHovered(pos);
    focusGrip.current = pos;
  }, [editor, menu, setHovered]);

  useEffect(() => {
    if (focusGrip.current === null) return;
    focusGrip.current = null;
    gripRef.current?.focus({ preventScroll: true });
  }, [menu, places]);

  useContextMenu(editor, touch, open);
  useShortcutHost(editor, page);

  const onCommand = (command: MenuCommand) => {
    if (!menu || command.kind === "submenu") return;
    const { pos } = menu;
    close("command");
    if (command.kind === "change") changeBlockType(editor, pos, command.typeId);
    else runBlockAction(editor, pos, command.id, page);
  };

  return (
    <>
      {places.map((place) => (
        <BlockHandle
          key={touch ? place.pos : "hovered"}
          place={place}
          touch={touch}
          open={menu?.pos === place.pos}
          shown={!touch && shown === place.pos}
          gripRef={place.pos === (menu?.pos ?? shown) ? gripRef : undefined}
          onOpen={(grip) => { if (menu?.pos === place.pos) close("outside"); else open(place.pos, { kind: "element", element: handleOf(grip), block: () => blockElement(editor, place.pos) }, grip); }}
          onAdd={() => { insertBelow(editor, place.pos); }}
          onDragStart={(event) => {
            const target = blockTargetFrom(editor.state.doc, place.pos);
            if (target) startBlockDrag(editor.view, target, event.nativeEvent);
          }}
          onDragEnd={() => { endBlockDrag(editor.view); }}
        />
      ))}
      {menu && view ? (
        <BlockMenu
          key={menu.pos}
          typeName={view.typeName}
          context={view.context}
          counts={view.counts}
          lastEdited={page?.lastEdited ?? null}
          mac={mac}
          anchor={menu.anchor}
          keepOpenOn={menu.grip}
          onCommand={onCommand}
          onClose={close}
        />
      ) : null}
    </>
  );
}

/**
 * The block menu's editor extension, when block handles are on: asked for
 * (`enabled`) and inside an artifact page's BlockMenuFor.
 */
export function useBlockHandles(enabled: boolean): { on: boolean; extensions: AnyExtension[] } {
  const page = useBlockMenuPage();
  const on = enabled && page !== null;
  const extensions = useMemo(() => (on ? [BlockMenuExtension.configure({ mac: isApplePlatform() })] : []), [on]);
  return { on, extensions };
}

/** The positioned box around the document that holds its block handles. */
export function BlockHandlesFrame({ editor, on, children }: { editor: Editor | null; on: boolean; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  return (
    <div ref={frame} className="relative">
      {children}
      {editor && on ? <BlockControls editor={editor} frame={frame} /> : null}
    </div>
  );
}
