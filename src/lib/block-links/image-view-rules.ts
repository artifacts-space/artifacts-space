import { parseBlockHash } from "./anchor-rules";

/*
 * The address of an image opened larger in place (the image viewer in
 * src/components/artifact-view/image-viewer). It is the image's own block
 * link, `#block-file=<file id>`, with `&view=1`: so the open image has a
 * link of its own, Back closes it, and a surface that does not know `view`
 * still lands on the image's block (parseBlockHash ignores the field).
 * Pure.
 */

const VIEW_FIELD = "view";

/** The URL fragment of an image opened larger, with the leading `#`. */
export function imageViewHash(fileId: string): string {
  return `#block-file=${fileId.toLowerCase()}&${VIEW_FIELD}=1`;
}

/** The fragment that names the same image's block, not opened. */
export function imageBlockHash(fileId: string): string {
  return `#block-file=${fileId.toLowerCase()}`;
}

/** The file id of the image a fragment says is open, or null when it names no open image. */
export function imageViewTarget(hash: string): string | null {
  const anchor = parseBlockHash(hash);
  if (anchor?.kind !== "file") return null;
  const body = hash.replace(/^#/, "").split(":~:")[0] ?? "";
  return new URLSearchParams(body).get(VIEW_FIELD) === "1" ? anchor.fileId : null;
}

/** The place `delta` steps from `index` among `count` images, kept inside the list: the ends do not wrap. */
export function stepImage(index: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index + delta));
}

/** "2 of 5", for the open image's place among the document's images. */
export function imagePlaceWords(index: number, count: number): string {
  return `${String(index + 1)} of ${String(count)}`;
}
