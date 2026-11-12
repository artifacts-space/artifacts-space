import { describe, expect, it } from "vitest";

import { restoredMessage, saveKindLabel, versionBadges, versionLabel, versionNote } from "./version-labels";

describe("version labels", () => {
  it("should describe the format and size when given a version", () => {
    expect(versionNote({ kind: "markdown", bytes: 2400 })).toBe("Markdown · 2.4 KB");
  });

  it("should list every badge that applies when a version is current and pending", () => {
    expect(versionBadges({ latest: true, approved: false, pending: true })).toEqual(["Current", "Waiting for approval"]);
    expect(versionBadges({ latest: false, approved: true, pending: false })).toEqual(["Live for readers"]);
  });

  it("should name a restore plainly when asked for its label", () => {
    expect(saveKindLabel("restore")).toBe("Restored an older version");
  });

  it("should name the replaced file when a version replaced one", () => {
    expect(versionLabel({ saveKind: "replace", replacedFile: "sow.pdf" })).toBe("Replaced sow.pdf");
  });

  it("should fall back to a plain label when the replaced file's old copy is gone", () => {
    expect(versionLabel({ saveKind: "replace", replacedFile: null })).toBe("Replaced a file");
    expect(versionLabel({ saveKind: "edit", replacedFile: "sow.pdf" })).toBe("Edited");
  });
});

describe("restoredMessage", () => {
  it("should say an agent's newer save is in History when the restore went over it", () => {
    expect(restoredMessage({ artifact: { pendingEdit: null }, savedOverAgents: true })).toBe("Restored. An agent saved changes since you opened History; theirs is in History.");
  });

  it("should say only that it is restored, or waits for approval, when no agent saved in between", () => {
    expect(restoredMessage({ artifact: { pendingEdit: null }, savedOverAgents: false })).toBe("Restored.");
    expect(restoredMessage({ artifact: { pendingEdit: { id: "r1" } }, savedOverAgents: false })).toBe("Restored. Waiting for approval.");
  });
});
