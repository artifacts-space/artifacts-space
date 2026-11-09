/** What a key press does in the grid editor when no cell is being edited. */
export type GridEditKey = "undo" | "redo" | "menu" | "escape" | "edit" | "clear" | "type";

export interface KeyPress {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

function shortcut(press: KeyPress): GridEditKey | null {
  const key = press.key.toLowerCase();
  if (key === "z") return press.shiftKey ? "redo" : "undo";
  if (key === "y") return "redo";
  return null;
}

const plainKeys: Partial<Record<string, GridEditKey>> = {
  Escape: "escape",
  Enter: "edit",
  F2: "edit",
  Delete: "clear",
  Backspace: "clear",
  ContextMenu: "menu",
};

function isMenuKey(press: KeyPress): boolean {
  return (press.altKey && press.key === "ArrowDown") || (press.shiftKey && press.key === "F10");
}

/**
 * Maps a key to a grid-editor action: Cmd or Ctrl+Z and Shift+Z undo and
 * redo; Alt+Down, the context-menu key, and Shift+F10 open the column menu;
 * Enter and F2 edit the cell; Delete and Backspace clear it; any other
 * printable key starts editing with that character. Returns null for keys
 * the grid moves with, such as arrows, Tab, and Shift+Enter.
 */
export function gridEditKey(press: KeyPress): GridEditKey | null {
  if (press.ctrlKey || press.metaKey) return shortcut(press);
  if (isMenuKey(press)) return "menu";
  // Shift+Enter moves up, as in a spreadsheet; only Enter on its own edits.
  if (press.altKey || (press.shiftKey && press.key === "Enter")) return null;
  return plainKeys[press.key] ?? (press.key.length === 1 ? "type" : null);
}
