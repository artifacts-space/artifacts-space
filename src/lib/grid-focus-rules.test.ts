import { describe, expect, it } from "vitest";

import { anyExit, exitAfterFocus, exitAfterKey, noExit, tabLeaves } from "./grid-focus-rules";

describe("leaving the grid with Tab", () => {
  it("should arm Tab both ways on Escape and disarm it on any other key", () => {
    expect(exitAfterKey("Escape")).toEqual(anyExit);
    expect(exitAfterKey("ArrowDown")).toEqual(noExit);
    expect(exitAfterKey("Tab")).toEqual(noExit);
  });

  it("should let only a Tab in an allowed direction leave", () => {
    expect(tabLeaves(anyExit, "Tab", false)).toBe(true);
    expect(tabLeaves(anyExit, "Tab", true)).toBe(true);
    expect(tabLeaves(anyExit, "Enter", false)).toBe(false);
    expect(tabLeaves(noExit, "Tab", false)).toBe(false);
    expect(tabLeaves({ forward: false, backward: true }, "Tab", false)).toBe(false);
    expect(tabLeaves({ forward: false, backward: true }, "Tab", true)).toBe(true);
  });

  it("should let the first Tab back the way focus came in leave", () => {
    expect(exitAfterFocus(noExit, "before")).toEqual({ forward: false, backward: true });
    expect(exitAfterFocus(noExit, "after")).toEqual({ forward: true, backward: false });
  });

  it("should start fresh when focus comes from a click or from inside the grid", () => {
    expect(exitAfterFocus(anyExit, "pointer")).toEqual(noExit);
    expect(exitAfterFocus(anyExit, "inside")).toEqual(noExit);
  });

  it("should keep the Escape exit when React replays a focus it queued while hydrating", () => {
    expect(exitAfterFocus(anyExit, "replay")).toEqual(anyExit);
    expect(exitAfterFocus({ forward: false, backward: true }, "replay")).toEqual({ forward: false, backward: true });
  });
});
