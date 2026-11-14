import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  beforePaintScript,
  bigStep,
  clampSize,
  isResetKey,
  keyboardResize,
  parseStoredSize,
  rememberedPanels,
  resizeCursor,
  sidebarBounds,
  sideBySideMinWidth,
  sidebarColumns,
  sidebarHandleLeft,
  sidebarPanel,
  step,
} from "./panel-size-rules";

describe("clampSize", () => {
  it("should keep a size inside its bounds when it is between them", () => {
    expect(clampSize(300, { min: 240, max: 520 })).toBe(300);
  });

  it("should stop at the edges when the size runs past them", () => {
    expect(clampSize(100, { min: 240, max: 520 })).toBe(240);
    expect(clampSize(900, { min: 240, max: 520 })).toBe(520);
  });

  it("should take the minimum when the bounds cross, as CSS clamp does", () => {
    expect(clampSize(300, { min: 240, max: 200 })).toBe(240);
  });
});

describe("sidebarBounds", () => {
  it("should allow the sidebar's full range", () => {
    expect(sidebarBounds()).toEqual({ min: sidebarPanel.min, max: sidebarPanel.max });
  });

  it("should leave the artifact pane its minimum width beside the widest sidebar when the window is the narrowest side-by-side one", () => {
    // A classic scrollbar takes up to 17 px of the window.
    expect(sideBySideMinWidth - 17 - sidebarPanel.max).toBeGreaterThanOrEqual(sidebarPanel.contentMin);
  });
});

describe("keyboardResize", () => {
  const bounds = { min: 240, max: 520 };

  it("should grow a vertical splitter's panel with ArrowRight and shrink it with ArrowLeft", () => {
    expect(keyboardResize("ArrowRight", false, 300, bounds, "vertical")).toBe(300 + step);
    expect(keyboardResize("ArrowLeft", false, 300, bounds, "vertical")).toBe(300 - step);
  });

  it("should grow a horizontal splitter's panel with ArrowDown and shrink it with ArrowUp", () => {
    expect(keyboardResize("ArrowDown", false, 100, { min: 64, max: 300 }, "horizontal")).toBe(100 + step);
    expect(keyboardResize("ArrowUp", false, 100, { min: 64, max: 300 }, "horizontal")).toBe(100 - step);
  });

  it("should take bigger steps when Shift is held", () => {
    expect(keyboardResize("ArrowRight", true, 300, bounds, "vertical")).toBe(300 + bigStep);
  });

  it("should jump to the minimum on Home and the maximum on End", () => {
    expect(keyboardResize("Home", false, 300, bounds, "vertical")).toBe(240);
    expect(keyboardResize("End", false, 300, bounds, "vertical")).toBe(520);
  });

  it("should stay inside the bounds when a step would pass them", () => {
    expect(keyboardResize("ArrowLeft", true, 250, bounds, "vertical")).toBe(240);
    expect(keyboardResize("ArrowRight", true, 510, bounds, "vertical")).toBe(520);
  });

  it("should ignore arrows across the splitter and other keys", () => {
    expect(keyboardResize("ArrowDown", false, 300, bounds, "vertical")).toBeNull();
    expect(keyboardResize("ArrowLeft", false, 100, bounds, "horizontal")).toBeNull();
    expect(keyboardResize("Enter", false, 300, bounds, "vertical")).toBeNull();
  });
});

describe("isResetKey", () => {
  it("should reset on Enter and on no other key", () => {
    expect(isResetKey("Enter")).toBe(true);
    for (const key of ["Escape", " ", "Home", "ArrowLeft"]) expect(isResetKey(key), key).toBe(false);
  });
});

describe("parseStoredSize", () => {
  it("should read a stored pixel size when it is a positive number", () => {
    expect(parseStoredSize("312")).toBe(312);
    expect(parseStoredSize("312.6")).toBe(313);
  });

  it("should return null when nothing is stored or the value is damaged", () => {
    for (const raw of [null, "", " ", "abc", "-4", "0", "Infinity", "99999"]) expect(parseStoredSize(raw), String(raw)).toBeNull();
  });
});

describe("beforePaintScript", () => {
  it("should name every remembered panel's key and CSS property when it is built", () => {
    const script = beforePaintScript();
    for (const panel of [sidebarPanel]) {
      expect(script).toContain(panel.storageKey);
      expect(script).toContain(panel.cssVar);
    }
  });

  /** Runs the script in a fresh context with a stand-in page and storage; returns the properties it set. */
  function runScript(getItem: (key: string) => string | null) {
    const set = new Map<string, string>();
    const documentElement = { style: { setProperty: (name: string, value: string) => set.set(name, value) } };
    runInNewContext(beforePaintScript(), { document: { documentElement }, localStorage: { getItem } });
    return Object.fromEntries(set);
  }

  it("should set only the remembered panels' sizes when other keys are stored", () => {
    const stored = new Map<string, string>([[sidebarPanel.storageKey, "333"], ["artifacts.space:workspace:projects-height", "300"]]);
    expect(runScript((key) => stored.get(key) ?? null)).toEqual({ [sidebarPanel.cssVar]: "333px" });
  });

  it("should read every stored value exactly as parseStoredSize does", () => {
    for (const raw of [null, "", "  ", "abc", "0", "-5", "312.6", " 300 ", "4000", "4001", "1e2", "Infinity", "NaN"]) {
      const expected = parseStoredSize(raw);
      const drawn = runScript((key) => (key === sidebarPanel.storageKey ? raw : null));
      expect(drawn, String(raw)).toEqual(expected === null ? {} : { [sidebarPanel.cssVar]: `${String(expected)}px` });
    }
  });

  it("should do nothing when storage cannot be read", () => {
    expect(runScript(() => { throw new Error("blocked"); })).toEqual({});
  });
});

describe("layout classes", () => {
  it("should draw the sidebar column inside the same bounds the handle reports when a size is stored", () => {
    const { min, max, defaultSize, cssVar, liveVar } = sidebarPanel;
    // A size on the move wins over the stored one, and with neither the default draws.
    const clamp = `clamp(${String(min)}px,var(${liveVar},var(${cssVar},${String(defaultSize)}px)),${String(max)}px)`;
    expect(sidebarColumns).toContain(clamp);
    expect(sidebarHandleLeft, "the handle sits on the same edge").toBe(`lg:left-[${clamp}]`);
  });
});

describe("live size properties", () => {
  it("should register every panel's live property as not inherited when the stylesheet loads", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const panel of rememberedPanels) {
      const rule = new RegExp(`@property ${panel.liveVar} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      expect(rule, `${panel.liveVar} is registered`).not.toBe("");
      // Inherited, a move would restyle every element under the one it is set on.
      expect(rule).toMatch(/inherits:\s*false/);
      // A universal syntax has no initial value, so the layout falls back to the stored size.
      expect(rule).toMatch(/syntax:\s*"\*"/);
      expect(rule).not.toContain("initial-value");
      expect(panel.liveVar).not.toBe(panel.cssVar);
    }
  });
});

describe("resizeCursor", () => {
  const bounds = { min: 272, max: 520 };

  it("should point both ways when the panel can grow and shrink", () => {
    expect(resizeCursor(300, bounds, "vertical")).toBe("col-resize");
    expect(resizeCursor(300, bounds, "horizontal")).toBe("row-resize");
  });

  it("should point the only way left when the panel is at its smallest or largest size", () => {
    expect(resizeCursor(272, bounds, "vertical")).toBe("e-resize");
    expect(resizeCursor(520, bounds, "vertical")).toBe("w-resize");
    expect(resizeCursor(272, bounds, "horizontal")).toBe("s-resize");
    expect(resizeCursor(520, bounds, "horizontal")).toBe("n-resize");
  });

  it("should treat a size past a limit as at it when the page drew the panel outside its bounds", () => {
    expect(resizeCursor(200, bounds, "vertical")).toBe("e-resize");
    expect(resizeCursor(600, bounds, "vertical")).toBe("w-resize");
  });

  it("should keep the two-way cursor when the bounds leave no room to move", () => {
    expect(resizeCursor(300, { min: 300, max: 300 }, "vertical")).toBe("col-resize");
  });
});
