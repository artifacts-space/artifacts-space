import type { McpConnectionRef } from "@/lib/harness/connection-ref";
import { loadConnectionStamp, recordClientInfo } from "@/lib/harness/connection-store";
import { clientInfoFromBody, type ClientInfo } from "@/lib/harness/harness-rules";

import { memoHarness, type HarnessSource } from "./harness-context";

/**
 * Keeps the clientInfo of an MCP `initialize` request on its connection, and
 * returns any clientInfo the request carries (newer clients send it on every
 * request) for this request's saves. Only `initialize` writes here, so plain
 * reads cost nothing; a save stores a changed per-request name itself
 * (loadConnectionStamp). Fails open: a client that cannot be recorded still
 * gets its answer, and its saves fall back to what is stored.
 */
export async function recordRequestClientInfo(connection: McpConnectionRef, body: unknown): Promise<ClientInfo | null> {
  const found = clientInfoFromBody(body);
  if (!found) return null;
  if (!found.initialize) return found.info;
  try {
    await recordClientInfo(connection, found.info);
  } catch (error) {
    console.error("[mcp] Recording clientInfo failed", error instanceof Error ? error.name : "unknown error");
  }
  return found.info;
}

/** The harness this request's saves stamp, looked up only when a write tool asks for it. */
export function connectionHarness(connection: McpConnectionRef, requestInfo: ClientInfo | null): HarnessSource {
  return memoHarness(() => loadConnectionStamp(connection, requestInfo));
}
