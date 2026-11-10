import type { RateLimitName } from "@/lib/abuse/limits";

/**
 * Which per-network limits a /api/files request counts against. A video or
 * audio player asks for the file again, with a Range header, each time the
 * viewer seeks or the browser fetches the next part. Those follow-ups count
 * against a playback budget of their own, so playing one long video never
 * uses up the views of every file on the network. The first request of a
 * player (`bytes=0-`), and every request without a Range header, is a view.
 *
 * The header is the client's to choose, so the playback budget is also
 * capped per file: sending a Range to skip the view budget buys at most that
 * many requests for any one file, within the network's playback total.
 */

type FileLimitName = Extract<RateLimitName, "fileDownloadByNetwork" | "fileRangeByNetwork" | "fileRangeByNetworkFile">;

/** `bytes=<start>-…` with a start past the first byte: a player continuing a file it already opened. */
const continuingRange = /^\s*bytes\s*=\s*0*[1-9]\d*\s*-/iu;
const fileIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** The limits to count for a request for `fileId` from `network`, with this Range header (null when it has none). */
export function fileRequestLimits(range: string | null, network: string, fileId: string): { name: FileLimitName; subject: string }[] {
  const playback = range !== null && continuingRange.test(range) && fileIdPattern.test(fileId);
  if (!playback) return [{ name: "fileDownloadByNetwork", subject: network }];
  return [
    { name: "fileRangeByNetwork", subject: network },
    { name: "fileRangeByNetworkFile", subject: `${network}:${fileId.toLowerCase()}` },
  ];
}
