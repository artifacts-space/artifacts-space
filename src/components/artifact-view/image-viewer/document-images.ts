import { keptDimensions } from "@/lib/files/image-dimensions";

/*
 * The images of the document an image sits in, read from the page: the
 * viewer steps through them in the order they are drawn, in the read view
 * and in the editor alike. An image is one the page marked for the viewer
 * (`imageMarks`); one that failed to load is not drawn, so it is not here.
 */

/** One image as the viewer shows it. */
export interface ViewerImage {
  fileId: string;
  /** The address the page already loaded it from, so the viewer asks for nothing new. */
  src: string;
  alt: string;
  caption: string;
  downloadUrl: string;
  /** Its pixel size, when the page knows it: the loaded picture's, else the stored one. */
  width: number | null;
  height: number | null;
  element: HTMLImageElement;
}

const MARKED = "img[data-image-view]";

/** The attributes that mark an `<img>` for the viewer. `viewKey` is unique to the block that draws it. */
export function imageMarks(fileId: string, downloadUrl: string, viewKey: string): Record<`data-${string}`, string> {
  return { "data-image-view": fileId.toLowerCase(), "data-image-download": downloadUrl, "data-image-key": viewKey };
}

/** The marked image a block drew, by its key, or null while it is not on the page. */
export function imageByKey(viewKey: string): HTMLImageElement | null {
  return document.querySelector<HTMLImageElement>(`img[data-image-key="${CSS.escape(viewKey)}"]`);
}

/** The first image on the page that shows `fileId`: the one a link to the open image opens. */
export function firstImageOf(fileId: string): HTMLImageElement | null {
  return document.querySelector<HTMLImageElement>(`img[data-image-view="${CSS.escape(fileId.toLowerCase())}"]`);
}

/** Every marked image of the document `from` is in (the editor's, else the read view's, else the page's), in order. */
export function documentImages(from: Element): HTMLImageElement[] {
  const scope = from.closest(".ProseMirror, .artifact-prose") ?? document;
  return [...scope.querySelectorAll<HTMLImageElement>(MARKED)];
}

/** The caption under an image's block: the reader's text, or what is typed in the editor's caption field. */
function captionOf(element: HTMLImageElement): string {
  const caption = element.closest("figure")?.querySelector("figcaption");
  if (!caption) return "";
  return (caption.querySelector("input")?.value ?? caption.textContent).trim();
}

function sizeOf(element: HTMLImageElement) {
  const loaded = keptDimensions(element.naturalWidth, element.naturalHeight);
  return loaded ?? keptDimensions(Number(element.getAttribute("width")), Number(element.getAttribute("height")));
}

/** One marked image as the viewer shows it. */
export function readImage(element: HTMLImageElement): ViewerImage {
  const size = sizeOf(element);
  return {
    fileId: element.dataset.imageView ?? "",
    src: element.currentSrc || element.src,
    alt: element.alt,
    caption: captionOf(element),
    downloadUrl: element.dataset.imageDownload ?? "",
    width: size?.width ?? null,
    height: size?.height ?? null,
    element,
  };
}
