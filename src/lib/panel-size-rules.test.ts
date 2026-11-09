import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  beforePaintScript,
  bigStep,
  clampSize,
  isResetKey,
  keyboardResize,
  listMinHeight,
  parseStoredSize,
  projectsBounds,
  projectsPanel,
  projectsRowsHeight,
  sidebarBounds,
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
  it("should allow the full range when the workspace is wide", () => {
    expect(sidebarBounds(1600)).toEqual({ min: sidebarPanel.min, max: sidebarPanel.max });
  });

  it("should leave the artifact pane its minimum width when the workspace is narrower", () => {
    expect(sidebarBounds(900)).toEqual({ min: sidebarPanel.min, max: 900 - sidebarPanel.contentMin });
  });

  it("should never put the maximum under the minimum when the workspace is very narrow", () => {
    expect(sidebarBounds(500)).toEqual({ min: sidebarPanel.min, max: sidebarPanel.min });
  });
});

describe("projectsBounds", () => {
  it("should stop at the rows' own height when the list has room to spare", () => {
    expect(projectsBounds({ content: 300, shared: 700 })).toEqual({ min: projectsPanel.min, max: 300 });
  });

  it("should leave the artifact list its minimum height when the rows are tall", () => {
    expect(projectsBounds({ content: 900, shared: 500 })).toEqual({ min: projectsPanel.min, max: 500 - projectsPanel.listMin });
  });

  it("should never put the maximum under the minimum when there are few rows", () => {
    expect(projectsBounds({ content: 40, shared: 500 })).toEqual({ min: projectsPanel.min, max: projectsPanel.min });
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
    for (const panel of [sidebarPanel, projectsPanel]) {
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

  it("should set only the sizes parseStoredSize accepts when it runs", () => {
    const stored = new Map<string, string>([[sidebarPanel.storageKey, "333"], [projectsPanel.storageKey, "abc"]]);
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
    const { min, max, contentMin, defaultSize, cssVar } = sidebarPanel;
    const clamp = `clamp(${String(min)}px,var(${cssVar},${String(defaultSize)}px),min(${String(max)}px,100%_-_${String(contentMin)}px))`;
    expect(sidebarColumns).toContain(clamp);
    expect(sidebarHandleLeft, "the handle sits on the same edge").toBe(`lg:left-[${clamp}]`);
  });

  it("should draw the Projects rows and the list inside the bounds the handle reports when a size is stored", () => {
    const { min, defaultSize, listMin, cssVar } = projectsPanel;
    expect(projectsRowsHeight).toContain(`lg:max-h-[var(${cssVar},${String(defaultSize)}px)]`);
    expect(projectsRowsHeight).toContain(`lg:min-h-[${String(min)}px]`);
    expect(listMinHeight).toBe(`lg:min-h-[${String(listMin)}px]`);
  });
});
