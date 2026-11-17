import type { MediaUploader } from "@/components/editor/rich/media-uploads";
import { markdownFileRefs } from "@/lib/files/media-rules";
import type { FileDto } from "@/lib/files/types";

/**
 * The /dev/workspace fixture's stand-in for files a document uploads from
 * its text (a dropped, pasted, or picked image): kept in this tab's
 * sessionStorage as data URLs, so a reload still shows them, and attached
 * to the stored artifact by the save that names them, marked as media the
 * document embeds, as the server does (writeAndAttach).
 */

/** A file that "exists" without an upload: it shows a real image from the site. A test can attach it to a stored artifact as a plain attachment. */
export const fixtureAttachedImageId = "00000000-0000-4000-8000-0000000000a1";

const mediaKey = "fixture:media";
/** Set to "1" by a test to hold every media upload until it dispatches `fixture:release-media` on window. */
const holdMediaKey = "fixture:hold-media";
/** Set by a test to refuse media uploads: "1" for the next one, "always" for every one. */
const failMediaKey = "fixture:fail-media";

interface StoredMedia extends FileDto {
  url: string;
}

function readMedia(): StoredMedia[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(mediaKey) ?? "[]");
    return Array.isArray(parsed) ? (parsed as StoredMedia[]) : [];
  } catch {
    return [];
  }
}

function writeMedia(list: readonly StoredMedia[]) {
  try {
    window.sessionStorage.setItem(mediaKey, JSON.stringify(list));
  } catch {
    // Storage is off or full: the file then shows until the reload only.
  }
}

/** Kept for the tab's life too, for when storage is off. */
const inTab = new Map<string, StoredMedia>();

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(typeof reader.result === "string" ? reader.result : ""); };
    reader.onerror = () => { reject(new Error("The file could not be read.")); };
    reader.readAsDataURL(file);
  });
}

function held(): Promise<void> {
  if (window.sessionStorage.getItem(holdMediaKey) !== "1") return Promise.resolve();
  return new Promise((resolve) => { window.addEventListener("fixture:release-media", () => { resolve(); }, { once: true }); });
}

function takeFailure(): boolean {
  const flag = window.sessionStorage.getItem(failMediaKey);
  if (flag === null) return false;
  if (flag !== "always") window.sessionStorage.removeItem(failMediaKey);
  return true;
}

/** Keeps the file in this tab and answers like the real flow, with progress. */
export const fixtureMediaUpload: MediaUploader = async (file, onProgress) => {
  onProgress(40);
  await held();
  if (takeFailure()) throw new Error("The upload did not finish. Check your connection and try again.");
  const stored: StoredMedia = {
    id: crypto.randomUUID(),
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    createdAt: new Date().toISOString(),
    replacedAt: null,
    embedded: true,
    url: await dataUrl(file),
  };
  inTab.set(stored.id, stored);
  writeMedia([...readMedia(), stored]);
  onProgress(100);
  return { id: stored.id, filename: stored.filename, contentType: stored.contentType };
};

function find(fileId: string): StoredMedia | undefined {
  return inTab.get(fileId) ?? readMedia().find((entry) => entry.id === fileId);
}

/** Where the fixture shows a file from: the upload kept in the tab, or a real image for the file that "exists". */
export function fixtureMediaUrl(fileId: string): string {
  if (fileId === fixtureAttachedImageId) return "/hero-dusk.webp";
  return find(fileId)?.url ?? `/dev/missing-file/${fileId}.png`;
}

/**
 * The artifact's files after a save of `content`, as the server leaves
 * them: every upload of the document that the content names is attached,
 * once, as media the document embeds. Files it already has stay.
 */
export function withContentMedia(files: readonly FileDto[], kind: string, content: string): FileDto[] {
  if (kind !== "markdown") return [...files];
  const have = new Set(files.map((file) => file.id));
  const added = markdownFileRefs(content).flatMap((id) => {
    const media = have.has(id) ? undefined : find(id);
    if (!media) return [];
    return [{ id: media.id, filename: media.filename, contentType: media.contentType, size: media.size, createdAt: media.createdAt, replacedAt: null, embedded: true }];
  });
  return [...files, ...added];
}
