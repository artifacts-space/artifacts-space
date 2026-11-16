import type { FileDto } from "@/lib/files/types";

import type { CaptureApi } from "./capture-api";
import { maxPictureBytes, pictureFetchTimeoutMs, type PictureProblem } from "./capture-host-rules";

/**
 * The pictures a frame shows, fetched by the capture host itself and handed
 * to the capture box as data URLs. A file's page URL redirects to file
 * storage on another origin, and a drawing library that follows that
 * redirect on its own fails in some browsers and logs an error. Fetched
 * here, with the site's cookies only and past the browser's cache (a copy
 * the page already showed is cached without the header a script needs), the
 * picture is in hand before anything draws, and the host knows which failed.
 */

/** A 1 × 1 transparent picture: what the box shows for a picture that could not be fetched, so nothing ever loads it from the network. */
export const blankPicture = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

function asDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(typeof reader.result === "string" ? reader.result : null); };
    reader.onerror = () => { resolve(null); };
    reader.readAsDataURL(blob);
  });
}

/** One picture: its data URL, or why the box shows the blank picture in its place. */
export type PictureResult = { url: string } | { problem: PictureProblem };

const problem = (why: PictureProblem): PictureResult => ({ problem: why });

/**
 * One picture as a data URL, or why there is none: the route did not answer
 * ok, the picture is empty or larger than the host inlines, the browser
 * could not read it, the request failed, or it took longer than `timeoutMs`
 * (a request that never answers must not hold the pass, and with it every
 * later one). Never throws.
 */
export async function fetchPicture(url: string, timeoutMs: number = pictureFetchTimeoutMs): Promise<PictureResult> {
  try {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return problem("status");
    const blob = await response.blob();
    if (blob.size === 0) return problem("empty");
    if (blob.size > maxPictureBytes) return problem("too-large");
    const dataUrl = await asDataUrl(blob);
    return dataUrl === null ? problem("unreadable") : { url: dataUrl };
  } catch (error) {
    return problem(error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network");
  }
}

/** Pictures already fetched in this pass, by file id: each with its data URL, or why it has none. */
export type PictureCache = Map<string, PictureResult>;

/**
 * The pictures of one frame: a URL for each id (the blank picture where the
 * fetch failed), whether any failed, and why each picture this call fetched
 * and left blank has none. A picture another frame fetched earlier in the
 * pass is not named again, so a pass counts each blank picture once.
 */
export interface FramePictures {
  urls: ReadonlyMap<string, string>;
  failed: boolean;
  problems: PictureProblem[];
}

/**
 * Fetches the pictures `ids` name, each once per pass. `files` are the
 * artifact's files by id; an id that is not among them is skipped (the
 * frame draws a notice for it).
 */
export async function loadPictures(ids: readonly string[], files: ReadonlyMap<string, FileDto>, api: Pick<CaptureApi, "pictureUrl">, cache: PictureCache): Promise<FramePictures> {
  const wanted = ids.flatMap((id) => {
    const file = files.get(id);
    return file ? [file] : [];
  });
  const problems: PictureProblem[] = [];
  await Promise.all(
    wanted.map(async (file) => {
      if (cache.has(file.id)) return;
      const result = await fetchPicture(api.pictureUrl(file));
      cache.set(file.id, result);
      if ("problem" in result) problems.push(result.problem);
    }),
  );
  const urls = new Map<string, string>();
  let failed = false;
  for (const file of wanted) {
    const result = cache.get(file.id);
    const url = result && "url" in result ? result.url : null;
    if (url === null) failed = true;
    urls.set(file.id, url ?? blankPicture);
  }
  return { urls, failed, problems };
}
