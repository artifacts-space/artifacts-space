import { after } from "next/server";

/**
 * Runs a side effect after the response is sent, so a comment or a sharing
 * change never waits on notifications. Outside a request (scripts, tests) it
 * runs at once instead. Failures are logged by name only, never thrown, and
 * never with ids, tokens, or content.
 */
export function afterResponse(label: string, task: () => Promise<void>): void {
  const run = () =>
    task().catch((error: unknown) => {
      console.error(`[notifications] ${label} failed`, error instanceof Error ? error.name : "unknown error");
    });
  try {
    after(run);
  } catch {
    void run();
  }
}
