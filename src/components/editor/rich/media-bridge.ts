import type { Point } from "./media-landing";

/**
 * How the page around a document hands it files. The document's media
 * blocks live in the editor; the page holds the title block, the space
 * under the text, a new page's first drop, and the list of files that are
 * attached but not in the text. The page never reaches into the editor: it
 * marks its column as the document's drop zone, and sends a request to the
 * document's element, which the editor answers (media-input.ts).
 */

/** Marks the part of a page whose file drags its document takes. */
export const dropZoneAttribute = "data-file-drop-zone";

/** The value of the mark while the page takes dropped files itself, so the document leaves them alone. */
export const zoneTakenByPage = "page";

/** Props that mark an element as the drop zone of the document inside it. */
export function dropZoneProps(takenByPage = false): Record<typeof dropZoneAttribute, string> {
  return { [dropZoneAttribute]: takenByPage ? zoneTakenByPage : "" };
}

/** True while a marked zone's page takes dropped files itself. */
export function takenByPage(zone: Element): boolean {
  return zone.getAttribute(dropZoneAttribute) === zoneTakenByPage;
}

/** The mark every media block carries in the editor (media-view.tsx). The read view's media does not, so only a document that can be typed into answers. */
const mediaBlockSelector = "[data-media-block]";

/**
 * True when the document inside `root` shows a media block. A block whose
 * file is still uploading is not in the saved content yet, so a page that
 * reads "empty" from its content asks this before it takes a paste or a
 * drop as its first content: the page already holds something.
 */
export function showsMedia(root: Element | null): boolean {
  return root?.querySelector(mediaBlockSelector) != null;
}

/** A file the artifact already has, for a block that shows it. */
export interface AttachedFile {
  id: string;
  filename: string;
  contentType: string;
}

/** What the page asks of the document: put these files in the text (at a point of the window, or at the cursor), or show a file the artifact already has. */
export type MediaRequest = { files: File[]; point?: Point | undefined } | { attached: AttachedFile };

/** The event that carries a request to the document's element. The editor cancels it when it took the request. */
export const addMediaEvent = "artifact:add-media";

function isAttachedFile(value: unknown): value is AttachedFile {
  if (typeof value !== "object" || value === null) return false;
  return "id" in value && typeof value.id === "string" && "filename" in value && typeof value.filename === "string" && "contentType" in value && typeof value.contentType === "string";
}

function isPoint(value: unknown): value is Point {
  return typeof value === "object" && value !== null && "x" in value && typeof value.x === "number" && "y" in value && typeof value.y === "number";
}

/** The request an event carries, or null for any other event or a detail that is not a request. */
export function readMediaRequest(event: Event): MediaRequest | null {
  const detail: unknown = event instanceof CustomEvent ? event.detail : null;
  if (typeof detail !== "object" || detail === null) return null;
  if ("attached" in detail) return isAttachedFile(detail.attached) ? { attached: detail.attached } : null;
  if (!("files" in detail) || !Array.isArray(detail.files)) return null;
  const files = detail.files.filter((file): file is File => file instanceof File);
  const point: unknown = "point" in detail ? detail.point : undefined;
  return { files, point: isPoint(point) ? point : undefined };
}

/** The mark the editor puts on a document that takes files (media-input.ts). A comment box and an interface's text block do not carry it. */
export const takesFilesAttribute = "data-takes-files";

const documentSelector = `[${takesFilesAttribute}][contenteditable="true"]`;

/** The document a person can type into, and that takes files, inside `root`; null when there is none (View source, another format, a reader). */
export function documentIn(root: Element | null): HTMLElement | null {
  return root?.querySelector<HTMLElement>(documentSelector) ?? null;
}

/** Sends a request to the document inside `root`. False when there is no document, or it did not take the request. */
export function askDocument(root: Element | null, request: MediaRequest): boolean {
  const target = documentIn(root);
  if (!target) return false;
  return !target.dispatchEvent(new CustomEvent<MediaRequest>(addMediaEvent, { detail: request, cancelable: true }));
}

/** How long a request waits for a document that is still loading. */
const documentWaitMs = 5000;

/**
 * Sends a request to the document inside `root`, now or as soon as it is on
 * the page: the editor loads on demand, and remounts after a paste picks a
 * format. Gives up quietly after a few seconds; `onMissed` then says so.
 */
export function askDocumentWhenReady(root: Element | null, request: MediaRequest, onMissed?: () => void): void {
  if (!root) { onMissed?.(); return; }
  if (documentIn(root)) {
    if (!askDocument(root, request)) onMissed?.();
    return;
  }
  const stop = () => { observer.disconnect(); window.clearTimeout(timer); };
  const observer = new MutationObserver(() => {
    if (!documentIn(root)) return;
    stop();
    if (!askDocument(root, request)) onMissed?.();
  });
  const timer = window.setTimeout(() => { stop(); onMissed?.(); }, documentWaitMs);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["contenteditable"] });
}
