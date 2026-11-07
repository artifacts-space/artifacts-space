import { describe, expect, it } from "vitest";

import { gridEditKey, type KeyPress } from "./csv-edit-keys";

const press = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({ key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...modifiers });

describe("gridEditKey", () => {
  it("should undo and redo when Cmd or Ctrl with Z or Y is pressed", () => {
    expect(gridEditKey(press("z", { metaKey: true }))).toBe("undo");
    expect(gridEditKey(press("Z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(gridEditKey(press("y", { ctrlKey: true }))).toBe("redo");
  });

  it("should leave other shortcuts to the browser when Cmd or Ctrl is held", () => {
    expect(gridEditKey(press("c", { metaKey: true }))).toBeNull();
    expect(gridEditKey(press("v", { ctrlKey: true }))).toBeNull();
  });

  it("should open the column menu when Alt+Down, Shift+F10, or the menu key is pressed", () => {
    expect(gridEditKey(press("ArrowDown", { altKey: true }))).toBe("menu");
    expect(gridEditKey(press("F10", { shiftKey: true }))).toBe("menu");
    expect(gridEditKey(press("ContextMenu"))).toBe("menu");
  });

  it("should edit, clear, or start typing when those keys are pressed", () => {
    expect(gridEditKey(press("Enter"))).toBe("edit");
    expect(gridEditKey(press("F2"))).toBe("edit");
    expect(gridEditKey(press("Backspace"))).toBe("clear");
    expect(gridEditKey(press("a"))).toBe("type");
    expect(gridEditKey(press("A", { shiftKey: true }))).toBe("type");
  });

  it("should return null when the key moves the active cell", () => {
    expect(gridEditKey(press("ArrowLeft"))).toBeNull();
    expect(gridEditKey(press("Tab"))).toBeNull();
    expect(gridEditKey(press("a", { altKey: true }))).toBeNull();
  });
});
