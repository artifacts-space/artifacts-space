import { describe, expect, it } from "vitest";

import { fileLimits } from "./config";
import { fileBucketLimits, fitsAtOnce, fullMessage, hasRoom, maxMarkdownFileRefs } from "./limit-rules";

describe("file limits per artifact", () => {
  it("should hold 100 files in the content and 20 plain attachments", () => {
    expect(fileBucketLimits).toEqual({ plain: 20, inline: 100 });
    expect(fileLimits.maxInlineFilesPerArtifact).toBe(100);
  });

  it("should take the 21st file in a document's text", () => {
    expect(hasRoom({ bucket: "inline", existing: 20, historyOnly: 0, adding: 1 })).toBe(true);
    expect(fitsAtOnce(20, 1, "inline")).toBe(true);
  });

  it("should take the 100th file in a document's text and refuse the 101st", () => {
    expect(hasRoom({ bucket: "inline", existing: 99, historyOnly: 0, adding: 1 })).toBe(true);
    expect(hasRoom({ bucket: "inline", existing: 100, historyOnly: 0, adding: 1 })).toBe(false);
    expect(hasRoom({ bucket: "inline", existing: 90, historyOnly: 0, adding: 11 })).toBe(false);
  });

  it("should still refuse the 21st plain attachment", () => {
    expect(hasRoom({ bucket: "plain", existing: 20, historyOnly: 0, adding: 1 })).toBe(false);
    expect(fitsAtOnce(20, 1, "plain")).toBe(false);
  });

  it("should not count files kept only for Restore", () => {
    expect(hasRoom({ bucket: "inline", existing: 130, historyOnly: 31, adding: 1 })).toBe(true);
    expect(hasRoom({ bucket: "inline", existing: 130, historyOnly: 30, adding: 1 })).toBe(false);
    expect(hasRoom({ bucket: "plain", existing: 22, historyOnly: 3, adding: 1 })).toBe(true);
  });

  it("should name the limit that was reached", () => {
    expect(fullMessage("inline")).toContain("at most 100 files in its content");
    expect(fullMessage("plain")).toContain("at most 20 files");
  });

  it("should let a Markdown save name every file it can show and every attachment it can link", () => {
    expect(maxMarkdownFileRefs).toBe(120);
  });
});
