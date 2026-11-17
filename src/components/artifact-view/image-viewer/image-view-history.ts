import { imageBlockHash, imageViewHash, imageViewTarget } from "@/lib/block-links/image-view-rules";

/*
 * The open image and the browser's history. Opening an image larger adds
 * one history entry whose address names the image (image-view-rules.ts), so
 * Back closes it, Forward opens it again, and the address is a link to it.
 * One pair of window listeners serves every image on the page.
 */

/** Told the file id of the image the address says is open, or null, whenever the history moves. */
type Listener = (openFileId: string | null) => void;

const listeners = new Set<Listener>();

function notify() {
  const open = openImageView();
  for (const listener of [...listeners]) listener(open);
}

/** The file id of the image the address says is open now, or null. */
export function openImageView(): string | null {
  return imageViewTarget(window.location.hash);
}

/** Calls `listener` whenever Back, Forward, or a new fragment changes which image is open; returns how to stop. */
export function watchImageView(listener: Listener): () => void {
  if (listeners.size === 0) {
    window.addEventListener("popstate", notify);
    window.addEventListener("hashchange", notify);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.removeEventListener("popstate", notify);
    window.removeEventListener("hashchange", notify);
  };
}

function address(hash: string): string {
  return `${window.location.pathname}${window.location.search}${hash}`;
}

/** Adds the history entry of an image that was just opened. */
export function pushImageView(fileId: string): void {
  window.history.pushState(null, "", address(imageViewHash(fileId)));
}

/** Names another image in the open viewer's entry: Previous and Next add no entries, so one Back still closes. */
export function replaceImageView(fileId: string): void {
  window.history.replaceState(null, "", address(imageViewHash(fileId)));
}

/**
 * Leaves the open image's entry when the viewer is closed by hand. An entry
 * this page added is stepped back over, as Back would. One the reader
 * arrived on (a link, or Forward) stays, and names the image's block.
 */
export function leaveImageView(fileId: string, added: boolean): void {
  if (openImageView() === null) return;
  if (added) window.history.back();
  else window.history.replaceState(null, "", address(imageBlockHash(fileId)));
}
