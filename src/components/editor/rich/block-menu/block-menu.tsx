"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import type { BlockSubmenuId, MenuCommand, MenuContext, MenuEntry } from "./block-actions";
import type { BlockMenuLastEdited } from "./block-menu-context";
import { MenuFooter, MenuRow, panelClass, panelWidth, placementClass, SearchRow } from "./block-menu-parts";
import { menuReducer, openedMenu, rowsFor, type MenuEvent, type MenuState } from "./block-menu-state";
import { ChangeSubmenu, ColorSubmenu, type SubmenuFrame } from "./block-submenus";
import { gripMenuRule, menuWidth, pointMenuRule, submenuRule, submenuWidth } from "./menu-placement";
import { canHover, useFloatingMenu, usePhoneSheet, usePressOutside, type MenuAnchor } from "./use-floating-menu";

/** Why the menu closed: Escape and Tab return focus to the grip; a press outside leaves focus where it lands. */
export type MenuCloseReason = "escape" | "outside";

export interface BlockMenuProps {
  /** What the menu calls the block: "Heading 2", "Table", and so on. */
  typeName: string;
  context: MenuContext;
  counts: { words: number; characters: number };
  lastEdited: BlockMenuLastEdited | null;
  mac: boolean;
  anchor: MenuAnchor;
  /** Presses on this element (the grip) do not count as outside the menu. */
  keepOpenOn: HTMLElement | null;
  onCommand: (command: MenuCommand) => void;
  onClose: (reason: MenuCloseReason) => void;
}

interface RowGroup {
  group: number;
  rows: { entry: MenuEntry; index: number }[];
}

/** The rows in their groups, in order; separators go between groups. */
function groupedRows(rows: readonly MenuEntry[]): RowGroup[] {
  const groups: RowGroup[] = [];
  rows.forEach((entry, index) => {
    const last = groups.at(-1);
    if (last?.group === entry.group) last.rows.push({ entry, index });
    else groups.push({ group: entry.group, rows: [{ entry, index }] });
  });
  return groups;
}

interface KeyActions {
  send: (event: MenuEvent) => void;
  choose: (index: number) => void;
  close: (reason: MenuCloseReason) => void;
}

/** What each key does in the menu, given its state and rows; undefined for keys it leaves alone. */
function keyAction(key: string, state: MenuState, rows: readonly MenuEntry[], actions: KeyActions): (() => void) | undefined {
  const { send, choose, close } = actions;
  const keys: Record<string, (() => void) | undefined> = {
    ArrowDown: () => { send({ type: "arrow", direction: 1 }); },
    ArrowUp: () => { send({ type: "arrow", direction: -1 }); },
    Enter: () => { choose(state.active); },
    ArrowRight: rows[state.active]?.command.kind === "submenu" ? () => { choose(state.active); } : undefined,
    Escape: () => { close("escape"); },
    Tab: () => { close("escape"); },
    Delete: state.query ? undefined : () => { choose(rows.findIndex((row) => row.key === "delete")); },
  };
  return keys[key];
}

/** Hovering a row with a submenu opens that submenu beside the menu; hovering any other row closes the open one. */
export function hoverSubmenu(command: MenuCommand | undefined, submenu: MenuState["submenu"]): MenuEvent | null {
  if (command?.kind === "submenu") return submenu?.id === command.id ? null : { type: "openSubmenu", id: command.id, focused: false };
  return submenu ? { type: "closeSubmenu" } : null;
}

/** Focuses the search with a mouse or trackpad; on touch, the panel, so the keyboard stays down until the search is tapped. */
function focusMenu(input: HTMLInputElement | null, panel: HTMLElement | null) {
  (canHover() ? input : panel)?.focus({ preventScroll: true });
}

interface MenuListProps {
  menuId: string;
  typeName: string;
  rows: readonly MenuEntry[];
  state: MenuState;
  mac: boolean;
  /** Ref callbacks for the rows that open a submenu, which it sits beside. */
  submenuRows: Readonly<Record<BlockSubmenuId, (element: HTMLElement | null) => void>>;
  onHover: (index: number) => void;
  onChoose: (index: number) => void;
}

/** The rows, grouped, with the block's type over the first group until something is typed. */
export function MenuList({ menuId, typeName, rows, state, mac, submenuRows, onHover, onChoose }: MenuListProps) {
  const labelled = !state.query;
  return (
    <div id={menuId} role="menu" aria-label={`${typeName} block`} className="flex flex-col">
      {groupedRows(rows).map(({ group, rows: groupRows }, position) => (
        <Fragment key={group}>
          {position > 0 ? <div role="separator" className="-mx-1.5 my-1 h-px shrink-0 bg-border" /> : null}
          <div role="group" aria-label={position === 0 && labelled ? typeName : undefined} className="flex flex-col">
            {position === 0 && labelled ? <div aria-hidden className="px-2 pt-1.5 pb-0.5 text-xs text-muted-foreground">{typeName}</div> : null}
            {groupRows.map(({ entry, index }) => (
              <MenuRow
                key={entry.key}
                entry={entry}
                id={`${menuId}-row-${String(index)}`}
                highlighted={state.active === index}
                expanded={entry.command.kind === "submenu" && state.submenu?.id === entry.command.id}
                mac={mac}
                rowRef={entry.command.kind === "submenu" ? submenuRows[entry.command.id] : undefined}
                onHover={() => { onHover(index); }}
                onChoose={() => { onChoose(index); }}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/** The rows that open submenus, kept so the open submenu can sit beside its row. */
function useSubmenuRows(open: MenuState["submenu"]) {
  const [changeRow, setChangeRow] = useState<HTMLElement | null>(null);
  const [colorRow, setColorRow] = useState<HTMLElement | null>(null);
  const refs = useMemo(() => ({ change: setChangeRow, color: setColorRow }), []);
  return [refs, open?.id === "color" ? colorRow : changeRow] as const;
}

/** The submenu that is open: Change or Color. */
function OpenSubmenu({ id, context, onCommand, frame }: { id: BlockSubmenuId; context: MenuContext; onCommand: (command: MenuCommand) => void; frame: SubmenuFrame }) {
  if (id === "color") return <ColorSubmenu {...frame} colors={context.colors} onPick={(part, hue) => { onCommand({ kind: "color", part, hue }); }} />;
  return <ChangeSubmenu {...frame} currentType={context.currentType} onPick={(typeId) => { onCommand({ kind: "change", typeId }); }} />;
}

/**
 * The block menu: a search field, the block's type, Change, the block
 * actions, Comment, and when the block was last edited. Nothing is
 * highlighted as it opens; hover, the arrow keys, or typing highlight a row,
 * and typing highlights the first match so Enter runs it. → opens Change,
 * ← or Escape closes it, and Escape closes the menu. Beside its anchor on
 * wider screens; a sheet with 44px rows on phones.
 */
export function BlockMenu({ typeName, context, counts, lastEdited, mac, anchor, keepOpenOn, onCommand, onClose }: BlockMenuProps) {
  const reduce = useCallback((state: MenuState, event: MenuEvent) => menuReducer(state, event, context), [context]);
  const [state, send] = useReducer(reduce, openedMenu);
  const rows = useMemo(() => rowsFor(state, context), [state, context]);
  const sheet = usePhoneSheet();
  const menuId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const keepRef = useRef(keepOpenOn);
  const insideRefs = useMemo(() => [panelRef, subRef, keepRef], []);
  const [submenuRows, submenuAnchor] = useSubmenuRows(state.submenu);
  const submenu = state.submenu;

  useFloatingMenu(panelRef, anchor, anchor.kind === "element" ? gripMenuRule : pointMenuRule, !sheet);
  useFloatingMenu(subRef, submenu ? submenuAnchor : null, submenuRule, !sheet);
  usePressOutside(insideRefs, useCallback(() => { onClose("outside"); }, [onClose]));
  useEffect(() => { focusMenu(inputRef.current, panelRef.current); }, []);
  useEffect(() => {
    if (state.active >= 0) document.getElementById(`${menuId}-row-${String(state.active)}`)?.scrollIntoView({ block: "nearest" });
  }, [menuId, state.active]);

  /** Runs a row, or opens its submenu (with focus in it when the keyboard or a touch chose it). */
  const choose = (index: number, focused = true) => {
    const row = rows[index];
    if (!row || row.disabled) return;
    if (row.command.kind === "submenu") send({ type: "openSubmenu", id: row.command.id, focused });
    else onCommand(row.command);
  };

  const hover = (index: number) => {
    if (state.active !== index) send({ type: "hover", index });
    if (sheet) return;
    const event = hoverSubmenu(rows[index]?.command, submenu);
    if (event) send(event);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = keyAction(event.key, state, rows, { send, choose, close: onClose });
    if (!action) return;
    event.preventDefault();
    action();
  };

  const backToMenu = () => {
    send({ type: "closeSubmenu" });
    requestAnimationFrame(() => { focusMenu(inputRef.current, panelRef.current); });
  };

  return createPortal(
    <>
      {sheet && submenu ? null : (
        <div ref={panelRef} tabIndex={-1} onKeyDown={onKeyDown} data-slot="block-menu" className={`${panelClass} ${placementClass(sheet)}`} style={panelWidth(sheet, menuWidth)}>
          <SearchRow inputRef={inputRef} value={state.query} menuId={menuId} activeId={state.active >= 0 ? `${menuId}-row-${String(state.active)}` : undefined} onChange={(query) => { send({ type: "typed", query }); }} />
          <MenuList menuId={menuId} typeName={typeName} rows={rows} state={state} mac={mac} submenuRows={submenuRows} onHover={hover} onChoose={(index) => { choose(index, !canHover()); }} />
          {rows.length === 0 ? <p className="px-2 py-2 text-sm text-muted-foreground">No actions match “{state.query.trim()}”.</p> : null}
          <MenuFooter lastEdited={lastEdited} words={counts.words} characters={counts.characters} />
        </div>
      )}
      {submenu ? (
        <OpenSubmenu
          id={submenu.id}
          context={context}
          onCommand={onCommand}
          frame={{ panelRef: subRef, className: `${panelClass} ${placementClass(sheet)}`, width: sheet ? undefined : submenuWidth, focused: submenu.focused || sheet, sheet, onBack: backToMenu, onCloseAll: () => { onClose("escape"); } }}
        />
      ) : null}
    </>,
    document.body,
  );
}
