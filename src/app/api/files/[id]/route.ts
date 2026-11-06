import { findReadableFile, signedFileUrl } from "@/lib/files/download";
import { getSession } from "@/lib/session";

/** Headers on every answer from this route. R2 serves the bytes; these cover what we send. */
const baseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function notFound() {
  return new Response("Not found", { status: 404, headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" } });
}

async function viewerId() {
  try {
    return (await getSession())?.user.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Shows or downloads a file. Access goes through the file's artifact: whoever
 * can view the artifact gets a 302 to a short-lived R2 link; everyone else,
 * and every unknown id, gets the same 404. `?download=1` forces a download.
 */
export async function GET(request: Request, context: RouteContext<"/api/files/[id]">) {
  try {
    const { id } = await context.params;
    const file = await findReadableFile(id, await viewerId());
    if (!file) return notFound();
    const download = new URL(request.url).searchParams.get("download") === "1";
    const { url } = await signedFileUrl(file, { download });
    return new Response(null, { status: 302, headers: { ...baseHeaders, Location: url } });
  } catch (error) {
    console.error("[files] Download failed", error instanceof Error ? error.name : "unknown error");
    return new Response("The file could not be loaded. Try again.", { status: 500, headers: { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" } });
  }
}
