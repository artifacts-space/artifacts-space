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
