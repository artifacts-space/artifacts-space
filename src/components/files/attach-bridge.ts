/**
 * How the parts of a page that are far from an artifact's list of attached
 * files hand it work: "Attach file" in a More menu, and a file dropped
 * anywhere on the page. They send a request, by the artifact's id, to the
 * document; the list that shows that artifact's files answers it
 * (attached-files.tsx), with the one uploader, the one attach, and the one
 * place that shows progress and refusals. Nothing reaches into the list.
 */

/** The event that carries a request. The list cancels it when it took the request. */
export const attachFilesEvent = "artifact:attach-files";

/** What is asked: attach these files, or, with none, let the person choose some. */
export interface AttachRequest {
  artifactId: string;
  files: File[] | null;
}

/** The files a request carries: null when it asks to choose some, undefined when what it carries is not a list of files. */
function filesOf(sent: unknown): File[] | null | undefined {
  if (sent === null || sent === undefined) return null;
  if (!Array.isArray(sent)) return undefined;
  const files = sent.filter((file): file is File => file instanceof File);
  return files.length > 0 ? files : undefined;
}

/** The request an event carries for `artifactId`, or null for any other event, another artifact, or a detail that is not a request. */
export function readAttachRequest(event: Event, artifactId: string): AttachRequest | null {
  const detail: unknown = event instanceof CustomEvent ? event.detail : null;
  if (typeof detail !== "object" || detail === null) return null;
  if (!("artifactId" in detail) || detail.artifactId !== artifactId) return null;
  const files = filesOf("files" in detail ? detail.files : null);
  return files === undefined ? null : { artifactId, files };
}

/**
 * Asks the list of the artifact's attached files to attach `files`, or to
 * open its file picker when none are given. False when no list on the page
 * took the request (the artifact is not open for editing here).
 */
export function askToAttach(artifactId: string, files?: readonly File[]): boolean {
  if (typeof document === "undefined") return false;
  const detail: AttachRequest = { artifactId, files: files ? [...files] : null };
  return !document.dispatchEvent(new CustomEvent<AttachRequest>(attachFilesEvent, { detail, cancelable: true }));
}
