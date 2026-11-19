import { appendFileSync } from "node:fs";
import path from "node:path";

import type { Reporter, TestCase } from "@playwright/test/reporter";

import { flakySummary } from "./flaky-summary-rules";

/**
 * CI only (playwright.config.ts): lists the tests that passed only on their
 * retry in the job's summary. It never fails a run: a summary that cannot
 * be written is skipped.
 */
export default class FlakySummaryReporter implements Reporter {
  private readonly tests = new Set<TestCase>();

  onTestEnd(test: TestCase) {
    this.tests.add(test);
  }

  onEnd() {
    const file = process.env.GITHUB_STEP_SUMMARY;
    if (!file) return;
    const flaky = [...this.tests]
      .filter((test) => test.outcome() === "flaky")
      .map((test) => ({ title: test.title, location: `${path.relative(process.cwd(), test.location.file)}:${String(test.location.line)}` }));
    try {
      const summary = flakySummary(flaky);
      if (summary) appendFileSync(file, `${summary}\n`);
    } catch {
      // The log's "flaky" block and the trace still hold it.
    }
  }
}
