import { z } from "zod";

import type { RateLimitCheck, RateLimitRefusal } from "@/lib/abuse/rate-limit";

import { toolAccess } from "./tool-access";

/**
 * Per-request MCP rate limits, checked before the MCP server runs, in one
 * database round trip. Read tools count against the caller's read budget,
 * per token and per user. Artifact edits count per token here; the per-user
 * edit limit lives with the edit itself (src/lib/artifacts.ts), so the web
 * editor shares it.
 */

/** Tools that change an artifact's content or files, and so may file a new version. */
const artifactEditTools = new Set<string>(["artifacts_update", "artifacts_restore_version", "files_attach"]);
const readTools = new Set<string>(Object.entries(toolAccess).flatMap(([name, level]) => (level === "read" ? [name] : [])));

const messageSchema = z.object({ method: z.string(), params: z.object({ name: z.string() }).loose().optional() }).loose();

/** The tool names a JSON-RPC body calls (one message, or a batch), in order. */
export function mcpToolCalls(body: unknown): string[] {
  const messages = Array.isArray(body) ? (body as unknown[]) : [body];
  return messages.flatMap((message) => {
    const parsed = messageSchema.safeParse(message);
    if (!parsed.success || parsed.data.method !== "tools/call" || !parsed.data.params) return [];
    return [parsed.data.params.name];
  });
}

/** The limits one request counts against, once each however many calls it holds. */
export function mcpLimitChecks(principal: { userId: string; tokenKey: string }, toolNames: readonly string[]): RateLimitCheck[] {
  const checks = new Map<string, RateLimitCheck>();
  for (const name of toolNames) {
    if (readTools.has(name)) {
      checks.set("readByToken", { name: "readByToken", subject: principal.tokenKey });
      checks.set("readByUser", { name: "readByUser", subject: principal.userId });
    }
    if (artifactEditTools.has(name)) checks.set("artifactUpdateByToken", { name: "artifactUpdateByToken", subject: principal.tokenKey });
  }
  return [...checks.values()];
}

/** The JSON-RPC id of a single-message body, for the error answer. */
export function jsonRpcId(body: unknown): string | number | null {
  const parsed = z.object({ id: z.union([z.string(), z.number()]) }).loose().safeParse(body);
  return parsed.success ? parsed.data.id : null;
}

/** A 429 with Retry-After and a JSON-RPC error whose message says what happened and when to try again. */
export function mcpRateLimitedResponse(refusal: RateLimitRefusal, message: string, id: string | number | null): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32029, message, data: { retryAfterSeconds: refusal.retryAfterSeconds, limit: refusal.name } }, id },
    { status: 429, headers: { "Retry-After": String(refusal.retryAfterSeconds), "Cache-Control": "no-store" } },
  );
}
