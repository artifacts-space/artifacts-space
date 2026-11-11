import { IconArrowDown, IconArrowUp, IconCopy, IconLink, IconMessage, IconPaint, IconRepeat, IconTrash, type Icon } from "@tabler/icons-react";

import { blockHues, colorChoiceLabel, type BlockColorPart, type BlockColors, type BlockHue } from "@/lib/block-colors/block-color-rules";

import { blockTypes, type BlockTypeOption } from "./block-types";

/*
 * What the block menu lists, and how its search finds things. Pure, so the
 * list and the matching are tested without a browser (block-actions.test.ts).
 */

/** The actions that run on a block. */
export type BlockActionId = "copyLink" | "duplicate" | "moveUp" | "moveDown" | "delete" | "comment";

/** The submenus the menu opens. */
export type BlockSubmenuId = "change" | "color";

/** What choosing a row does: run an action, change the block's type or a color, or open a submenu. */
export type MenuCommand =
  | { kind: "action"; id: BlockActionId }
  | { kind: "change"; typeId: string }
  | { kind: "color"; part: BlockColorPart; hue: BlockHue | null }
  | { kind: "submenu"; id: BlockSubmenuId };

/** One row of the menu. */
export interface MenuEntry {
  key: string;
  label: string;
  icon: Icon;
  command: MenuCommand;
  /** Rows in one group sit together between separators. */
  group: number;
  shortcut?: BlockActionId | undefined;
  danger?: boolean | undefined;
  disabled?: boolean | undefined;
}

/** What this block and this reader allow. */
export interface MenuContext {
  /** The block's type is on the Change list (text, headings, lists, code, quote). */
  changeable: boolean;
  /** The block's current type id, left out of "Change to" results. */
  currentType: string | null;
  /** The block has lines of text to color (not code, tables, dividers, or media). */
  colorable: boolean;
  /** The block's current colors, left out of color search results. */
  colors: BlockColors;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** The block has an artifact page to link to. */
  canLink: boolean;
  /** The reader may write comments on this artifact. */
  canComment: boolean;
}

interface ActionSpec {
  id: BlockActionId;
  label: string;
  icon: Icon;
  keywords: readonly string[];
  group: number;
  danger?: boolean;
}

const actionSpecs: readonly ActionSpec[] = [
  { id: "copyLink", label: "Copy link to block", icon: IconLink, keywords: ["url", "anchor", "share"], group: 1 },
  { id: "duplicate", label: "Duplicate", icon: IconCopy, keywords: ["copy", "clone"], group: 1 },
  { id: "moveUp", label: "Move up", icon: IconArrowUp, keywords: ["up", "reorder"], group: 1 },
  { id: "moveDown", label: "Move down", icon: IconArrowDown, keywords: ["down", "reorder"], group: 1 },
  { id: "delete", label: "Delete", icon: IconTrash, keywords: ["remove", "trash"], group: 1, danger: true },
  { id: "comment", label: "Comment", icon: IconMessage, keywords: ["discuss", "quote", "note"], group: 2 },
];

/** Whether an action shows for this block and reader. */
function shows(id: BlockActionId, context: MenuContext): boolean {
  if (id === "copyLink") return context.canLink;
  if (id === "comment") return context.canComment;
  return true;
}

/** Whether an action that shows can run now: Move needs a neighbour to swap with. */
function enabled(id: BlockActionId, context: MenuContext): boolean {
  if (id === "moveUp") return context.canMoveUp;
  if (id === "moveDown") return context.canMoveDown;
  return true;
}

function actionEntry(spec: ActionSpec, context: MenuContext): MenuEntry {
  return {
    key: spec.id,
    label: spec.label,
    icon: spec.icon,
    command: { kind: "action", id: spec.id },
    group: spec.group,
    shortcut: spec.id,
    danger: spec.danger,
    disabled: !enabled(spec.id, context),
  };
}

const changeEntry: MenuEntry = { key: "change", label: "Change", icon: IconRepeat, command: { kind: "submenu", id: "change" }, group: 0 };

const colorEntry: MenuEntry = { key: "color", label: "Color", icon: IconPaint, command: { kind: "submenu", id: "color" }, group: 0 };

/** The menu as it opens, before anything is typed: Change and Color, then the block actions, then Comment. */
export function menuEntries(context: MenuContext): MenuEntry[] {
  const actions = actionSpecs.filter((spec) => shows(spec.id, context)).map((spec) => actionEntry(spec, context));
  const submenus = [context.changeable ? changeEntry : null, context.colorable ? colorEntry : null].filter((entry) => entry !== null);
  return [...submenus, ...actions];
}

/** Every color row, text colors then backgrounds, each starting with Default, except the block's current ones. */
export function colorEntries(colors: BlockColors): MenuEntry[] {
  const hues: readonly (BlockHue | null)[] = [null, ...blockHues];
  const parts: readonly BlockColorPart[] = ["color", "background"];
  return parts.flatMap((part) =>
    hues
      .filter((hue) => hue !== colors[part])
      .map((hue) => ({ key: `${part}:${hue ?? "default"}`, label: colorChoiceLabel(part, hue), icon: IconPaint, command: { kind: "color", part, hue }, group: 0 }) satisfies MenuEntry),
  );
}

/** The "Change to …" rows for the types a block can change to. */
export function changeEntries(currentType: string | null): MenuEntry[] {
  return blockTypes.filter((option) => option.id !== currentType).map((option) => typeEntry(option));
}

function typeEntry(option: BlockTypeOption): MenuEntry {
  return { key: `change:${option.id}`, label: `Change to ${option.label}`, icon: option.icon, command: { kind: "change", typeId: option.id }, group: 0 };
}

function matchesWords(query: string, label: string, keywords: readonly string[]): boolean {
  return label.toLowerCase().includes(query) || keywords.some((keyword) => keyword.startsWith(query));
}

/** A type matches by its name or keywords, or by "change to …" and "turn into …" typed out. */
function typeMatches(query: string, option: BlockTypeOption): boolean {
  if (matchesWords(query, option.label, option.keywords)) return true;
  const name = option.label.toLowerCase();
  return `change to ${name}`.startsWith(query) || `turn into ${name}`.startsWith(query);
}

/**
 * The rows for what was typed. Nothing typed gives the whole menu. Otherwise
 * the actions whose name or keywords match, and the submenus' entries that
 * match, written out ("Change to Heading 2"), in menu order.
 */
export function searchMenu(query: string, context: MenuContext): MenuEntry[] {
  const needle = query.trim().toLowerCase();
  const all = menuEntries(context);
  if (!needle) return all;
  return all.flatMap((entry) => (entry.command.kind === "submenu" ? submenuMatches(needle, entry, context) : actionMatches(needle, entry)));
}

/** An action row when its name or keywords match. */
function actionMatches(needle: string, entry: MenuEntry): MenuEntry[] {
  const spec = actionSpecs.find((item) => item.id === entry.key);
  return matchesWords(needle, entry.label, spec?.keywords ?? []) ? [entry] : [];
}

/** The submenu's row when it matches, then each of its entries that matches, written out. */
function submenuMatches(needle: string, entry: MenuEntry, context: MenuContext): MenuEntry[] {
  if (entry.key === "color") return colorMatches(needle, entry, context);
  const own = matchesWords(needle, entry.label, ["turn into", "type"]) ? [entry] : [];
  const types = blockTypes.filter((option) => option.id !== context.currentType && typeMatches(needle, option)).map((option) => typeEntry(option));
  return [...own, ...types];
}

/** The Color row when it matches, then each color row whose name contains what was typed ("red", "background"). */
function colorMatches(needle: string, entry: MenuEntry, context: MenuContext): MenuEntry[] {
  const own = matchesWords(needle, entry.label, ["colour", "highlight", "background"]) ? [entry] : [];
  return [...own, ...colorEntries(context.colors).filter((row) => row.label.toLowerCase().includes(needle))];
}

/** The first row that can run, or -1: what Enter runs after typing. */
export function firstRunnable(entries: readonly MenuEntry[]): number {
  return entries.findIndex((entry) => !entry.disabled);
}

/** The next runnable row from `from` in `direction`, wrapping around; -1 when none can run. */
export function nextRunnable(entries: readonly MenuEntry[], from: number, direction: 1 | -1): number {
  const count = entries.length;
  if (count === 0) return -1;
  let index = from < 0 ? (direction === 1 ? -1 : count) : from;
  for (let step = 0; step < count; step += 1) {
    index = (index + direction + count) % count;
    if (!entries[index]?.disabled) return index;
  }
  return -1;
}

interface ShortcutKeys {
  /** The label shown in the menu. */
  label: string;
  /** The editor's key binding, in ProseMirror's notation. */
  binding: string;
}

const macShortcuts: Readonly<Record<BlockActionId, ShortcutKeys>> = {
  copyLink: { label: "⌘⌃L", binding: "Mod-Ctrl-l" },
  duplicate: { label: "⌘D", binding: "Mod-d" },
  moveUp: { label: "⌥⇧↑", binding: "Alt-Shift-ArrowUp" },
  moveDown: { label: "⌥⇧↓", binding: "Alt-Shift-ArrowDown" },
  delete: { label: "Del", binding: "" },
  comment: { label: "⌘⇧M", binding: "Mod-Shift-m" },
};

const otherShortcuts: Readonly<Record<BlockActionId, ShortcutKeys>> = {
  copyLink: { label: "Alt+Shift+L", binding: "Alt-Shift-l" },
  duplicate: { label: "Ctrl+D", binding: "Mod-d" },
  moveUp: { label: "Alt+Shift+↑", binding: "Alt-Shift-ArrowUp" },
  moveDown: { label: "Alt+Shift+↓", binding: "Alt-Shift-ArrowDown" },
  delete: { label: "Del", binding: "" },
  comment: { label: "Ctrl+Shift+M", binding: "Mod-Shift-m" },
};

/** The key for an action on this platform: a label for the menu and the editor binding ("" when the menu only shows it). */
export function shortcutFor(id: BlockActionId, mac: boolean): ShortcutKeys {
  return (mac ? macShortcuts : otherShortcuts)[id];
}

/** True on Apple platforms, where shortcuts use ⌘ and ⌥. False on the server. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}
