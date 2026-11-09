import type { HarnessStamp } from "@/lib/harness/harness-rules";

/**
 * The agent harness of the connection a tool call came through, for write
 * tools to stamp on what they save. Resolved on first use and at most once
 * per request; read-only calls never look it up.
 */
export type HarnessSource = () => Promise<HarnessStamp | null>;

/** No harness: for callers outside an MCP request, and for tests that do not care. */
export const noHarness: HarnessSource = () => Promise.resolve(null);

/**
 * Wraps a lookup so it runs once, and so a failure stamps nothing instead of
 * failing the save: knowing the harness is never worth losing an agent's work.
 */
export function memoHarness(load: () => Promise<HarnessStamp | null>): HarnessSource {
  let pending: Promise<HarnessStamp | null> | null = null;
  return () => {
    pending ??= load().catch((error: unknown) => {
      console.error("[mcp] Harness lookup failed", error instanceof Error ? error.name : "unknown error");
      return null;
    });
    return pending;
  };
}
