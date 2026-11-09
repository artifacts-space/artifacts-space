import { describe, expect, it } from "vitest";

import { ownSaveBase } from "./restore-base-rules";

const t0 = "2026-11-08T12:00:00.000Z";
const t1 = "2026-11-08T12:01:00.000Z";
const t2 = "2026-11-08T12:02:00.000Z";
const someoneElse = "2026-11-08T12:01:30.000Z";

describe("ownSaveBase", () => {
  it("should keep the editor's time when the page saved nothing of its own", () => {
    expect(ownSaveBase(t0, new Map())).toBe(t0);
  });

  it("should follow the page's own cover, icon, and theme saves from the editor's time", () => {
    expect(ownSaveBase(t0, new Map([[t0, t1], [t1, t2]]))).toBe(t2);
  });

  it("should stop at the editor's time when someone else saved before the page's own change", () => {
    // The page's theme change moved the artifact from their save, not from the editor's copy.
    expect(ownSaveBase(t0, new Map([[someoneElse, t2]]))).toBe(t0);
  });

  it("should stop where the chain breaks when someone else saved after the page's own change", () => {
    expect(ownSaveBase(t0, new Map([[t0, t1], [someoneElse, t2]]))).toBe(t1);
  });

  it("should end when an entry points back at itself", () => {
    expect(ownSaveBase(t0, new Map([[t0, t0]]))).toBe(t0);
  });
});
