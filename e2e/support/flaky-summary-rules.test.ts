import { describe, expect, it } from "vitest";

import { flakySummary, flakyTests, type FinishedTest } from "./flaky-summary-rules";

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

/** A finished test in `e2e/canvas.spec.ts`, inside these describe blocks. */
function finished(outcome: string, title: string, blocks: string[] = []): FinishedTest {
  return { outcome: () => outcome, titlePath: () => ["", "desktop", "canvas.spec.ts", ...blocks, title], location: { file: "/repo/e2e/canvas.spec.ts", line: 242 } };
}

describe("flakyTests", () => {
  const relative = (file: string) => file.replace("/repo/", "");

  it("should list a test that passed only on its retry, with its describe blocks and where it is", () => {
    expect(flakyTests([finished("flaky", "should focus the frame", ["in the workspace pane"])], relative)).toEqual([
      { title: "in the workspace pane › should focus the frame", location: "e2e/canvas.spec.ts:242" },
    ]);
  });

  it("should leave out a test that failed every attempt, was skipped, or passed first time", () => {
    const tests = [finished("unexpected", "should fail twice"), finished("skipped", "should skip"), finished("expected", "should pass")];
    expect(flakyTests(tests, relative)).toEqual([]);
  });
});
