"use client";

import { IconChevronRight, IconSearch } from "@tabler/icons-react";
import type { CSSProperties, RefObject } from "react";

import { HarnessByline } from "@/components/harness/harness-byline";
import { editorName } from "@/components/history/last-edited";
import { PixelAvatar } from "@/components/pixel-avatar";

import { shortcutFor, type MenuEntry } from "./block-actions";
import type { BlockMenuLastEdited } from "./block-menu-context";
import { formatCounts, formatEditedAt } from "./edited-at";

/** One row of the menu: 32px high with tight padding, 44px and roomier on phones, highlighted by hover, the arrow keys, or typing. */
export const rowClass =
  "flex h-8 w-full shrink-0 cursor-default items-center gap-2 rounded-lg px-1.5 text-left text-sm outline-none select-none max-sm:h-11 max-sm:gap-2.5 max-sm:px-2 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground aria-disabled:opacity-50 data-[variant=destructive]:data-highlighted:text-destructive data-[variant=destructive]:data-highlighted:[&_svg]:text-destructive focus-visible:bg-accent";

/** The panel: popover tokens and the menu shadow, with quiet scrollbars. */
export const panelClass =
  "z-50 flex flex-col overflow-y-auto overscroll-contain bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none scrollbar-quiet";

/**
 * Floating beside its anchor on wider screens; a sheet from the bottom on
 * phones. Neither slides, zooms, or moves as it opens: the floating menu
 * stays transparent until it is placed, then fades in over 150ms (ease-out),
 * and the sheet only fades. No fade at all under reduced motion. Widths are
 * inline styles from the `menuWidth` and `submenuWidth` constants in
 * menu-placement.ts, never a class here.
 */
export function placementClass(sheet: boolean): string {
  if (sheet) return "fixed inset-x-0 bottom-0 max-h-[72dvh] rounded-t-xl px-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] animate-in fade-in-0 duration-100 motion-reduce:animate-none";
  return "fixed top-0 left-0 rounded-xl transition-opacity duration-150 ease-out not-data-placed:pointer-events-none not-data-placed:opacity-0 motion-reduce:transition-none";
}

/** A floating panel's width in pixels; none in the phone sheet, which spans the screen. */
export function panelWidth(sheet: boolean, width: number): CSSProperties | undefined {
  return sheet ? undefined : { width };
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
    <div className="flex shrink-0 items-center gap-2 px-1.5 text-muted-foreground max-sm:gap-2.5 max-sm:px-2">
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
      {!submenu && entry.shortcut ? <kbd className="ml-auto shrink-0 pl-1 font-mono text-xs text-muted-foreground">{shortcutFor(entry.shortcut, mac).label}</kbd> : null}
    </button>
  );
}

/** "Last edited", who, when, and the block's size, under the menu. */
export function MenuFooter({ lastEdited, words, characters }: { lastEdited: BlockMenuLastEdited | null; words: number; characters: number }) {
  return (
    <div className="mt-1 grid shrink-0 gap-0.5 border-t px-1.5 pt-2 pb-1 text-xs text-muted-foreground" data-slot="block-menu-footer">
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
