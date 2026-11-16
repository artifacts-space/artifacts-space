import type { FileDto } from "@/lib/files/types";

import type { CaptureApi } from "./capture-api";
import { maxPictureBytes } from "./capture-host-rules";

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

/** One picture as a data URL, or null when it could not be fetched or is larger than the host inlines. Never throws. */
async function fetchPicture(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.size === 0 || blob.size > maxPictureBytes) return null;
    return await asDataUrl(blob);
  } catch {
    return null;
  }
}

/** Pictures already fetched in this pass, by file id: a data URL, or null for one that failed. */
export type PictureCache = Map<string, string | null>;

/** The pictures of one frame: a URL for each id (the blank picture where the fetch failed), and whether any failed. */
export interface FramePictures {
  urls: ReadonlyMap<string, string>;
  failed: boolean;
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
  await Promise.all(
    wanted.map(async (file) => {
      if (cache.has(file.id)) return;
      cache.set(file.id, await fetchPicture(api.pictureUrl(file)));
    }),
  );
  const urls = new Map<string, string>();
  let failed = false;
  for (const file of wanted) {
    const url = cache.get(file.id) ?? null;
    if (url === null) failed = true;
    urls.set(file.id, url ?? blankPicture);
  }
  return { urls, failed };
}
