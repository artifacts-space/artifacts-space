import { isCronAuthorized } from "@/lib/cron-auth";
import { cleanupAbandonedFiles } from "@/lib/files/store";
import { pruneAllVersions } from "@/lib/versions/history";

export const maxDuration = 60;

/** The settled value, or null after logging why it failed. */
function settled<T>(result: PromiseSettledResult<T>, label: string): T | null {
  if (result.status === "fulfilled") return result.value;
  console.error(`[cleanup] ${label} failed`, result.reason instanceof Error ? result.reason.name : "unknown error");
  return null;
}

/**
 * Vercel Cron (see vercel.json): deletes uploads that were never finished and
 * files never attached to an artifact, from R2 and the database, and prunes
 * artifact versions past the retention limit (src/lib/versions/history-rules.ts).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [filesResult, versionsResult] = await Promise.allSettled([cleanupAbandonedFiles(), pruneAllVersions()]);
  const files = settled(filesResult, "File cleanup");
  const versions = settled(versionsResult, "Version pruning");
  if (!files && !versions) return Response.json({ error: "Cleanup failed" }, { status: 500 });
  return Response.json({ ...(files ?? { removed: 0, remaining: false }), versions }, { status: files && versions ? 200 : 500 });
}
