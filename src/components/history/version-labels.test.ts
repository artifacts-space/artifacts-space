import { describe, expect, it } from "vitest";

import { saveKindLabel, versionBadges, versionNote } from "./version-labels";

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
});
