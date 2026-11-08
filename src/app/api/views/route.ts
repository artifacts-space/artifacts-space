import { handleViewBeacon } from "@/lib/views/beacon";

/*
 * The view beacon: a public artifact page posts here once after it loads
 * (src/components/views/view-beacon.tsx), so prerendered and cached pages
 * still count, and most bots, which run no JavaScript, never do. The answer
 * is always an empty 204, whatever happened, so the page never sees an error
 * and nobody can probe which artifacts exist or are public.
 */

const empty = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    await handleViewBeacon(request);
  } catch (error) {
    console.error("[views] Beacon failed", error instanceof Error ? error.name : "unknown error");
  }
  return empty();
}
