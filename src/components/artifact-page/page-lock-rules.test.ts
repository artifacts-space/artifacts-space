import { describe, expect, it } from "vitest";

import { savedCopyAfterSave } from "./page-lock-rules";

describe("savedCopyAfterSave", () => {
  it("should take the save's answer when the page is unlocked", () => {
    expect(savedCopyAfterSave({ version: 1 }, { version: 2 })).toEqual({ version: 2 });
  });

  it("should stay locked when a save answers while the page is locked", () => {
    expect(savedCopyAfterSave(null, { version: 2 })).toBeNull();
  });
});
