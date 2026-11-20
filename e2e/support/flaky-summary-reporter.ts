import { appendFileSync } from "node:fs";
import path from "node:path";

import type { Reporter, TestCase } from "@playwright/test/reporter";

import { flakySummary, flakyTests } from "./flaky-summary-rules";

/**
 * CI only (playwright.config.ts): lists the tests that passed only on their
 * retry in the job's summary. It never fails a run: whatever goes wrong
 * here is said in the log and the summary is skipped.
 */
export default class FlakySummaryReporter implements Reporter {
  private readonly tests = new Set<TestCase>();

  onTestEnd(test: TestCase) {
    this.tests.add(test);
  }

  onEnd() {
    const file = process.env.GITHUB_STEP_SUMMARY;
    if (!file) return;
    try {
      const summary = flakySummary(flakyTests([...this.tests], (absolute) => path.relative(process.cwd(), absolute)));
      if (summary) appendFileSync(file, `${summary}\n`);
    } catch (error) {
      // The log's "flaky" block and the trace still hold it.
      console.warn("[flaky-summary] The job summary was not written:", error instanceof Error ? error.message : "unknown error");
    }
  }
}
