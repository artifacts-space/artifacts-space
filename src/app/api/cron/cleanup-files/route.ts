import { isCronAuthorized } from "@/lib/cron-auth";
import { cleanupAbandonedFiles } from "@/lib/files/store";

export const maxDuration = 60;

/**
 * Vercel Cron (see vercel.json): deletes uploads that were never finished and
 * files never attached to an artifact, from R2 and the database.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await cleanupAbandonedFiles();
    return Response.json(result);
  } catch (error) {
    console.error("[files] Cleanup failed", error instanceof Error ? error.name : "unknown error");
    return Response.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
