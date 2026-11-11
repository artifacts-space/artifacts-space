"use client";

import { IconCheck, IconChevronLeft, IconChevronRight, IconSearch } from "@tabler/icons-react";
import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

import { HarnessByline } from "@/components/harness/harness-byline";
import { editorName } from "@/components/history/last-edited";
import { PixelAvatar } from "@/components/pixel-avatar";
import { cn } from "@/lib/utils";

import { shortcutFor, type MenuEntry } from "./block-actions";
import type { BlockMenuLastEdited } from "./block-menu-context";
import { blockTypes } from "./block-types";
import { formatCounts, formatEditedAt } from "./edited-at";

/** One row of the menu: 32px high, 44px on phones, highlighted by hover, the arrow keys, or typing. */
export const rowClass =
  "flex h-8 w-full shrink-0 cursor-default items-center gap-2.5 rounded-lg px-2 text-left text-sm outline-none select-none max-sm:h-11 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground aria-disabled:opacity-50 data-[variant=destructive]:data-highlighted:text-destructive data-[variant=destructive]:data-highlighted:[&_svg]:text-destructive focus-visible:bg-accent";

/** The panel: popover tokens and the menu shadow, with quiet scrollbars. */
export const panelClass =
  "z-50 flex flex-col overflow-y-auto overscroll-contain bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none scrollbar-quiet";

/** Floating beside its anchor on wider screens; a sheet from the bottom on phones. */
export function placementClass(sheet: boolean, width: string): string {
  if (sheet) return "fixed inset-x-0 bottom-0 max-h-[72dvh] rounded-t-xl px-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] animate-in fade-in-0 slide-in-from-bottom-4 duration-150 motion-reduce:animate-none";
  return cn("fixed top-0 left-0 rounded-xl not-data-placed:opacity-0 animate-in fade-in-0 zoom-in-95 duration-100 motion-reduce:animate-none", width);
}

interface SearchRowProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  menuId: string;
  activeId: string | undefined;
  onChange: (value: string) => void;
}

/** The search field: an icon and a bare input, with no border, ring, or fill even when focused. */
export function SearchRow({ inputRef, value, menuId, activeId, onChange }: SearchRowProps) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 px-2 text-muted-foreground">
      <IconSearch aria-hidden className="size-4 shrink-0" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => { onChange(event.target.value); }}
        placeholder="Search actions…"
        aria-label="Search actions"
        aria-controls={menuId}
        aria-activedescendant={activeId}
        autoComplete="off"
        spellCheck={false}
        className="h-9 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground shadow-none ring-0 outline-none placeholder:text-muted-foreground focus:outline-none focus-visible:ring-0 focus-visible:outline-none max-sm:h-11 max-sm:text-base"
      />
    </div>
  );
}

interface MenuRowProps {
  entry: MenuEntry;
  id: string;
  highlighted: boolean;
  expanded: boolean;
  mac: boolean;
  /** Set on the Change row, which its submenu opens beside. */
  rowRef?: ((element: HTMLButtonElement | null) => void) | undefined;
  onHover: () => void;
  onChoose: () => void;
}

/** A row: its icon and name, then its shortcut, or › when it opens a submenu. */
export function MenuRow({ entry, id, highlighted, expanded, mac, rowRef, onHover, onChoose }: MenuRowProps) {
  const submenu = entry.command.kind === "submenu";
  const Icon = entry.icon;
  return (
    <button
      ref={rowRef}
      id={id}
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={entry.disabled ? true : undefined}
      aria-haspopup={submenu ? "menu" : undefined}
      aria-expanded={submenu ? expanded : undefined}
      data-highlighted={highlighted ? "" : undefined}
      data-variant={entry.danger ? "destructive" : undefined}
      onMouseDown={(event) => { event.preventDefault(); }}
      onMouseMove={onHover}
      onClick={onChoose}
      className={rowClass}
    >
      <Icon aria-hidden />
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      {submenu ? <IconChevronRight aria-hidden /> : null}
      {!submenu && entry.shortcut ? <kbd className="ml-auto font-mono text-xs tracking-wide text-muted-foreground">{shortcutFor(entry.shortcut, mac).label}</kbd> : null}
    </button>
  );
}

/** "Last edited", who, when, and the block's size, under the menu. */
export function MenuFooter({ lastEdited, words, characters }: { lastEdited: BlockMenuLastEdited | null; words: number; characters: number }) {
  return (
    <div className="mt-1 grid shrink-0 gap-0.5 border-t px-2 pt-2 pb-1 text-xs text-muted-foreground" data-slot="block-menu-footer">
      {lastEdited ? (
        <>
          <span>Last edited</span>
          {lastEdited.editor ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-foreground">
              <PixelAvatar seed={lastEdited.editor.id} kind={lastEdited.editor.kind} size={16} />
              <span className="truncate">{editorName(lastEdited.editor)}</span>
              <HarnessByline harness={lastEdited.harness} className="text-xs" />
            </span>
          ) : null}
          <span>{formatEditedAt(new Date(lastEdited.at), new Date())}</span>
        </>
      ) : null}
      <span>{formatCounts(words, characters)}</span>
    </div>
  );
}

const subRowClass = cn(rowClass, "focus:bg-accent focus:text-accent-foreground");

/** Moves focus between the submenu's rows with the arrow keys, Home, and End. */
function moveFocus(event: KeyboardEvent<HTMLElement>, container: HTMLElement | null): boolean {
  const rows = [...(container?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
  const current = rows.findIndex((row) => row === document.activeElement);
  const steps: Record<string, number> = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: rows.length - 1 };
  const next = steps[event.key];
  if (next === undefined || rows.length === 0) return false;
  rows[(next + rows.length) % rows.length]?.focus();
  return true;
}

interface ChangeSubmenuProps {
  panelRef: RefObject<HTMLDivElement | null>;
  className: string;
  currentType: string | null;
  focused: boolean;
  /** Phones show the submenu in place of the menu, with a way back. */
  sheet: boolean;
  onPick: (typeId: string) => void;
  onBack: () => void;
  onCloseAll: () => void;
}

/** "Change": every block type, each with its icon, and a check on the current one. */
export function ChangeSubmenu({ panelRef, className, currentType, focused, sheet, onPick, onBack, onCloseAll }: ChangeSubmenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focused) return;
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]");
    const checked = listRef.current?.querySelector<HTMLElement>("[aria-checked=true]");
    (checked ?? rows?.[0])?.focus({ preventScroll: true });
  }, [focused]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (moveFocus(event, listRef.current)) {
      event.preventDefault();
    } else if (event.key === "ArrowLeft" || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onBack();
    } else if (event.key === "Tab") {
      event.preventDefault();
      onCloseAll();
    }
  };

  return (
    <div ref={panelRef} className={className} onKeyDown={onKeyDown} data-slot="block-menu-change">
      {sheet ? (
        <button type="button" onClick={onBack} className={cn(rowClass, "text-muted-foreground")}>
          <IconChevronLeft aria-hidden /> Change
        </button>
      ) : null}
      <div ref={listRef} role="menu" aria-label="Change to" className="flex flex-col">
        {blockTypes.map((option) => {
          const Icon = option.icon;
          const checked = option.id === currentType;
          return (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              tabIndex={-1}
              onClick={() => { onPick(option.id); }}
              className={subRowClass}
            >
              <Icon aria-hidden />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <IconCheck aria-hidden className={cn("ml-auto text-foreground!", checked ? "visible" : "invisible")} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
