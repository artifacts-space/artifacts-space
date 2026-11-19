import { describe, expect, it } from "vitest";

import { flakySummary } from "./flaky-summary-rules";

describe("flakySummary", () => {
  it("should write nothing when no test was flaky", () => {
    expect(flakySummary([])).toBe("");
  });

  it("should name each test that passed only on its retry, with where it is", () => {
    const summary = flakySummary([
      { title: "should focus the frame", location: "e2e/canvas.spec.ts:242" },
      { title: "should open the artifact", location: "e2e/notification-opens-artifact.spec.ts:60" },
    ]);
    expect(summary).toContain("### 2 browser tests passed only on their retry");
    expect(summary).toContain("- should focus the frame (`e2e/canvas.spec.ts:242`)");
    expect(summary).toContain("- should open the artifact (`e2e/notification-opens-artifact.spec.ts:60`)");
  });

  it("should count one test in the singular", () => {
    expect(flakySummary([{ title: "should save", location: "e2e/a.spec.ts:1" }])).toContain("### 1 browser test passed only on its retry");
  });
});
