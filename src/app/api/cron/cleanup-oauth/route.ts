import { isCronAuthorized } from "@/lib/cron-auth";
import { cleanupOAuth } from "@/lib/oauth/clients";

export const maxDuration = 60;

/**
 * Vercel Cron (see vercel.json): deletes MCP apps that registered themselves
 * but were never approved, expired access tokens, and old refresh tokens.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await cleanupOAuth());
  } catch (error) {
    console.error("[oauth] Cleanup failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
