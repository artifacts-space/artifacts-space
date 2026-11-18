import type { PageFilesApi } from "@/components/files/page-files-api";
import { uploadCancelled } from "@/components/files/put-file";
import type { ArtifactDto } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";
import { pageFileTypeFor } from "@/lib/page-files/rules";
import { readZip } from "@/lib/zip/read-zip";

/*
 * Development only: an HTML artifact's page files kept in the tab, for the
 * /dev/editor fixture (`?kind=html`), so e2e/page-files-web.spec.ts runs
 * the web app's drop, pick, upload queue, and publish without a database or
 * file storage. It answers as the server does: one file per path, a file
 * at a held path replaces it (same id, new size), and one publish is one
 * change. It counts what it was asked, on `window.fixturePageFiles`, so a
 * test can prove a set went in as one publish. Test switches, in
 * sessionStorage:
 * - `fixture:hold-page-uploads` "1": every upload waits until the test
 *   dispatches `fixture:release-page-uploads` on window, or is aborted.
 * - `fixture:hold-page-checks` "1": every check of a sent file waits until
 *   the test dispatches `fixture:release-page-checks`.
 * - `fixture:hold-page-publish` "1": every publish waits until the test
 *   dispatches `fixture:release-page-publish`.
 * - `fixture:next-page-publish` "refuse": the next publish is refused.
 * - `fixture:hold-zip-unpack` "1": a dropped zip waits before it is read
 *   until the test dispatches `fixture:release-zip-unpack`, or Cancel
 *   stops it.
 * A file whose name starts with `broken` fails the server's check.
 */

/** What the stand-in was asked, for the tests. */
export interface FixturePageCounts {
  requests: number[];
  puts: number;
  aborts: number;
  publishes: { added: string[]; replaced: string[]; removed: string[] }[];
  discards: number;
  /** The text of each file sent, by its path, so a test can compare it with what it dropped. */
  sent: Record<string, string>;
}

declare global {
  interface Window {
    fixturePageFiles?: FixturePageCounts;
  }
}

function counts(): FixturePageCounts {
  window.fixturePageFiles ??= { requests: [], puts: 0, aborts: 0, publishes: [], discards: 0, sent: {} };
  return window.fixturePageFiles;
}

function flag(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function takeFlag(key: string): string | null {
  const value = flag(key);
  try { window.sessionStorage.removeItem(key); } catch { /* Storage is off: the switch is for tests only. */ }
  return value;
}

/** Waits for the test's release while uploads are held, and gives up at once when the upload is aborted. */
function held(signal: AbortSignal): Promise<void> {
  if (flag("fixture:hold-page-uploads") !== "1") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const abort = () => { counts().aborts += 1; reject(new Error(uploadCancelled)); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    window.addEventListener("fixture:release-page-uploads", () => { resolve(); }, { once: true });
  });
}

/** Resolves at once, or once the test dispatches `release` on window while `key` is set. */
function gate(key: string, release: string): Promise<void> {
  if (flag(key) !== "1") return Promise.resolve();
  return new Promise((resolve) => { window.addEventListener(release, () => { resolve(); }, { once: true }); });
}

/** A page file of the fixture: a seeded one (`?files=1`) with a fixed id, so the server's page and the browser's agree, or an upload with its own. */
export function fixturePageFile(pagePath: string, size: number, id: string): FileDto {
  const contentType = pageFileTypeFor(pagePath)?.contentType ?? "application/octet-stream";
  return { id, filename: pagePath.slice(pagePath.lastIndexOf("/") + 1), contentType, size, createdAt: "2026-11-17T00:00:00.000Z", replacedAt: null, pagePath };
}

/** The fixture artifact's files, held in the tab: its attachments and its page files. */
export interface FixtureFiles {
  get: () => FileDto[];
  set: (files: FileDto[]) => void;
}

/** A holder for the fixture's files, starting with these. */
export function fixtureFiles(initial: readonly FileDto[]): FixtureFiles {
  let files = [...initial];
  return { get: () => files, set: (next) => { files = next; } };
}

/** One artifact's page files in the tab: the artifact as it is now, and its files. */
export interface FixturePageStore {
  artifact: () => ArtifactDto;
  files: FixtureFiles;
}

/** Applies one publish to the files in the tab: adds, replaces at a held path, and removes. */
function applyPublish(store: FixturePageStore, uploads: readonly FileDto[], remove: readonly string[]) {
  const now = new Date().toISOString();
  const published = { added: [] as string[], replaced: [] as string[], removed: [...remove] };
  let files = store.files.get().filter((file) => file.pagePath === undefined || !remove.includes(file.pagePath));
  for (const upload of uploads) {
    const at = files.find((file) => file.pagePath === upload.pagePath);
    if (at) {
      files = files.map((file) => (file === at ? { ...file, size: upload.size, replacedAt: now } : file));
      published.replaced.push(upload.pagePath ?? "");
    } else {
      files = [...files, upload];
      published.added.push(upload.pagePath ?? "");
    }
  }
  store.files.set(files);
  return published;
}

/** The fixture's page files, over the same files the fixture's attachments live in, for the artifact a call names. */
export function memoryPageFilesApi(storeFor: (artifactId: string) => FixturePageStore | null): PageFilesApi {
  const uploads = new Map<string, FileDto>();
  return {
    request: ({ files }) => {
      counts().requests.push(files.length);
      const tickets = files.map((file) => {
        const fileId = crypto.randomUUID();
        uploads.set(fileId, { ...fixturePageFile(file.path, file.size, fileId), createdAt: new Date().toISOString() });
        return { path: file.path, fileId, url: `https://store.invalid/${fileId}`, headers: {} };
      });
      return Promise.resolve({ success: true, data: tickets });
    },
    put: async (ticket, file, onProgress, signal) => {
      counts().puts += 1;
      await held(signal);
      counts().sent[ticket.path] = await file.text();
      onProgress(100);
    },
    finalize: async (fileId) => {
      await gate("fixture:hold-page-checks", "fixture:release-page-checks");
      const upload = uploads.get(fileId);
      if (!upload) return { success: false, error: "File not found." };
      if (upload.filename.startsWith("broken")) {
        uploads.delete(fileId);
        return { success: false, error: "The file does not look like the type its path says. Upload the file again." };
      }
      return { success: true, data: upload };
    },
    publish: async ({ artifactId, uploadIds, remove }) => {
      await gate("fixture:hold-page-publish", "fixture:release-page-publish");
      const store = storeFor(artifactId);
      if (!store) return { success: false, error: "Artifact not found." };
      if (takeFlag("fixture:next-page-publish") === "refuse") return { success: false, error: "The page's files or these uploads changed while they were being published, so nothing was changed." };
      // As the server does: an upload that was deleted, or is in an artifact already, refuses the whole publish.
      if (uploadIds.some((id) => !uploads.has(id))) return { success: false, error: "These uploads are gone, so nothing was changed." };
      const named = uploadIds.flatMap((id) => uploads.get(id) ?? []);
      const published = applyPublish(store, named, remove);
      for (const id of uploadIds) uploads.delete(id);
      counts().publishes.push(published);
      return { success: true, data: { artifact: { ...store.artifact(), files: store.files.get(), updatedAt: new Date().toISOString() }, status: "applied", ...published } };
    },
    discard: (fileId) => {
      counts().discards += 1;
      uploads.delete(fileId);
      return Promise.resolve();
    },
    readZip: async (bytes, options) => {
      if (flag("fixture:hold-zip-unpack") === "1") {
        const released = await new Promise<boolean>((resolve) => {
          if (options.signal?.aborted) { resolve(false); return; }
          options.signal?.addEventListener("abort", () => { resolve(false); }, { once: true });
          window.addEventListener("fixture:release-zip-unpack", () => { resolve(true); }, { once: true });
        });
        if (!released) return { ok: false, fault: "cancelled", bytesOut: 0 };
      }
      return readZip(bytes, options);
    },
  };
}
