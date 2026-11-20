/** What the summary needs of a finished test: Playwright's TestCase has it, and a test passes a stand-in. */
export interface FinishedTest {
  outcome(): string;
  titlePath(): string[];
  location: { file: string; line: number };
}

/**
 * The tests that passed only on their retry, as the summary's rows: the
 * describe blocks and the title, and the file and line from `root`. A test
 * that failed every attempt, was skipped, or passed first time is not one.
 */
export function flakyTests(tests: readonly FinishedTest[], relative: (file: string) => string): { title: string; location: string }[] {
  return tests
    .filter((test) => test.outcome() === "flaky")
    .map((test) => ({
      // The path starts with the root, the project, and the file: the row keeps the describe blocks and the title.
      title: test.titlePath().slice(3).join(" › "),
      location: `${relative(test.location.file)}:${String(test.location.line)}`,
    }));
}

/**
 * The lines CI adds to a shard's job summary when tests passed only on
 * their retry, so a green check still shows them on the checks page, not
 * only at the end of one shard's log. Kept apart from the reporter so it is
 * tested without Playwright. Nothing when no test was flaky.
 */
export function flakySummary(flaky: readonly { title: string; location: string }[]): string {
  if (flaky.length === 0) return "";
  const rows = flaky.map((test) => `- ${test.title} (\`${test.location}\`)`);
  const count = flaky.length === 1 ? "1 browser test passed only on its retry" : `${String(flaky.length)} browser tests passed only on their retry`;
  return [`### ${count}`, "", "Each is a bug to fix, in the test or in the app. The retried attempt's trace is in this shard's artifact.", "", ...rows, ""].join("\n");
}
