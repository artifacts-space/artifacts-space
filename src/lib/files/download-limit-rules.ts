import type { RateLimitName } from "@/lib/abuse/limits";

/**
 * Which per-network limit a /api/files request counts against. A video or
 * audio player asks for the file again, with a Range header, each time the
 * viewer seeks or the browser fetches the next part. Those follow-ups count
 * against their own budget, so playing one long video never uses up the
 * views of every file on the network. The first request of a player
 * (`bytes=0-`), and every request without a Range header, is a view.
 */

/** `bytes=<start>-…` with a start past the first byte: a player continuing a file it already opened. */
const continuingRange = /^\s*bytes\s*=\s*0*[1-9]\d*\s*-/iu;

/** The limit for a file request with this Range header (null when it has none). */
export function fileRequestLimit(range: string | null): Extract<RateLimitName, "fileDownloadByNetwork" | "fileRangeByNetwork"> {
  return range !== null && continuingRange.test(range) ? "fileRangeByNetwork" : "fileDownloadByNetwork";
}
