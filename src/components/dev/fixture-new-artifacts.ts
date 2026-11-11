import { updateArtifactAction } from "@/app/(workspace)/app/actions";
import type { NewArtifactApi } from "@/components/app/new-artifact/new-artifact-api";
import { updateCheckOptions, validateArtifactContent } from "@/lib/artifact-content";
import type { ActionResult, ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import { unusableFilesForPeople } from "@/lib/files/person-messages";
import { approvalNotSentNotice } from "@/lib/files/replace-rules";
import type { FileDto } from "@/lib/files/types";

import { fixtureArtifact } from "./fixture-content";

/**
 * The /dev/workspace fixture's stand-in for storing new artifacts: kept in
 * this tab's sessionStorage, so a reload shows what was stored (and only
 * that), and counted, so the e2e checks can prove a page was created once.
 * It refuses what the server refuses: content that does not fit its format,
 * and files that are gone or in another artifact. Test switches (below) add
 * outcomes on top; one of them, `first-only-always`, deliberately models a
 * partial attach the server cannot produce today (attachFiles is
 * all-or-nothing), to cover the page's defence against one.
 */

const artifactsKey = "fixture:new-artifacts";
const createsKey = "fixture:new-artifact-creates";
/** Set by a test to refuse creates, as a rate limit would: "1" for the next one, "always" for every one. */
const failNextKey = "fixture:fail-next-create";
/** Set to "1" by a test to hold every upload until it dispatches `fixture:release-uploads` on window, so it can act while files are on their way. */
const holdUploadsKey = "fixture:hold-uploads";
/** Set to "1" by a test to hold creates until it dispatches `fixture:release-create`. */
const holdCreateKey = "fixture:hold-create";
/** Set to "1" by a test to hold attaches until it dispatches `fixture:release-attach`. */
const holdAttachKey = "fixture:hold-attach";
/** Set by a test for the next attach: "refuse" answers no; "lose" attaches the files and then loses the answer; "lose-always" loses every answer; "vanish" loses the answer without attaching ("vanish-always" every one); "first-only-always" attaches only the first file and loses every answer: a partial attach, which today's all-or-nothing server cannot produce (the page's defensive case). A comma list sets several in turn. */
const nextAttachKey = "fixture:next-attach";
/** Set by a test for the next replace: "refuse" answers no, as the server does when the file changed meanwhile; "not-sent" replaces the file but answers with the notice the server gives when the request for approval failed. */
const nextReplaceKey = "fixture:next-replace";
/** The uploads deleted so far, so a test can check that none it kept was deleted. */
const discardedKey = "fixture:discarded";
/** Set by a test to make the next load fail ("always" for every one). */
const failLoadKey = "fixture:fail-load";
/** Set to "1" by a test to hold loads until it dispatches `fixture:release-load`. */
const holdLoadKey = "fixture:hold-load";

function readFlag(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Resolves at once, or when the test dispatches `release` on window while `key` is set. While it waits, `<key>:waiting` is "1", so a test can act then. */
function gate(key: string, release: string): Promise<void> {
  if (readFlag(key) !== "1") return Promise.resolve();
  window.sessionStorage.setItem(`${key}:waiting`, "1");
  return new Promise((resolve) => {
    window.addEventListener(release, () => {
      window.sessionStorage.removeItem(`${key}:waiting`);
      resolve();
    }, { once: true });
  });
}

/** Reads a one-time flag and clears it. A value ending in "always" stays; a comma list ("vanish,refuse") gives one value per call. */
function takeFlag(key: string): string | null {
  const value = readFlag(key);
  if (value === null || value.endsWith("always")) return value;
  const [first = "", ...rest] = value.split(",");
  if (rest.length > 0) window.sessionStorage.setItem(key, rest.join(","));
  else window.sessionStorage.removeItem(key);
  return first;
}

function recordDiscard(fileId: string) {
  try {
    const raw = window.sessionStorage.getItem(discardedKey);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
    window.sessionStorage.setItem(discardedKey, JSON.stringify([...list, fileId]));
  } catch {
    // Storage is off: the record is for tests only.
  }
}

function readStored(): ArtifactDto[] {
  try {
    const raw = window.sessionStorage.getItem(artifactsKey);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ArtifactDto[]) : [];
  } catch {
    return [];
  }
}

function writeStored(list: readonly ArtifactDto[]) {
  try {
    window.sessionStorage.setItem(artifactsKey, JSON.stringify(list));
  } catch {
    // Storage can be off in private windows; the fixture then forgets on reload.
  }
}

function countCreate() {
  try {
    window.sessionStorage.setItem(createsKey, String(Number(window.sessionStorage.getItem(createsKey) ?? "0") + 1));
  } catch {
    // As above.
  }
}

/** Artifacts the fixture stored in this tab, newest first. Empty on the server. */
export function storedFixtureArtifacts(): ArtifactDto[] {
  if (typeof window === "undefined") return [];
  return readStored();
}

function contentProblem(kind: ArtifactKind, content: string, options: { emptyMarkdown?: boolean }): string | null {
  const check = validateArtifactContent(kind, content, options);
  return check.valid ? null : check.message;
}

const uploaded = new Map<string, FileDto>();
let created = 0;

function save(next: ArtifactDto): ActionResult<ArtifactDto> {
  writeStored([next, ...readStored().filter((entry) => entry.id !== next.id)]);
  return { success: true, data: next };
}

/** Creates already stored in this tab, by create id. */
const createdByRequest = new Map<string, string>();

/** Every file some stored new artifact has. */
function attachedIds(): Set<string> {
  return new Set(readStored().flatMap((entry) => entry.files.map((file) => file.id)));
}

/** The fixture's NewArtifactApi. */
export const fixtureNewArtifactApi: NewArtifactApi = {
  create: async (input, fileIds, requestId) => {
    await gate(holdCreateKey, "fixture:release-create");
    const earlier = readStored().find((entry) => entry.id === createdByRequest.get(requestId));
    if (earlier) return { success: true, data: earlier };
    const kind = input.kind ?? "markdown";
    const problem = contentProblem(kind, input.content, { emptyMarkdown: true });
    if (problem) return { success: false, error: problem };
    // As the server does (assertUsableFiles): a file that is gone, or in another artifact, refuses the create.
    if (fileIds.some((fileId) => !uploaded.has(fileId) || attachedIds().has(fileId))) return { success: false, error: unusableFilesForPeople };
    if (takeFlag(failNextKey) !== null) return { success: false, error: "You have made a lot of artifacts in a short time. Try again in a minute." };
    countCreate();
    created += 1;
    const now = new Date().toISOString();
    const id = `fixture-new-${String(Date.now())}-${String(created)}`;
    const base = fixtureArtifact({ id, kind, title: input.title, content: input.content, publicId: `fixturenew${String(Date.now()).slice(-10)}${String(created).padStart(2, "0")}`, updatedAt: now });
    const files = fileIds.flatMap((fileId) => uploaded.get(fileId) ?? []);
    createdByRequest.set(requestId, id);
    return save({ ...base, summary: input.summary ?? "", language: input.language ?? "", icon: input.icon ?? null, files });
  },
  update: (id, changes, options) => {
    const current = readStored().find((entry) => entry.id === id);
    // The fixture's own artifacts save as they always have, through the server action.
    if (!current) return updateArtifactAction(id, changes, options);
    const next = { ...current, ...changes, updatedAt: new Date().toISOString() };
    const touchesContent = changes.content !== undefined || changes.kind !== undefined;
    const problem = touchesContent ? contentProblem(next.kind, next.content, updateCheckOptions(current.content)) : null;
    if (problem) return Promise.resolve({ success: false, error: problem });
    return Promise.resolve(save(next));
  },
  send: async (file, report) => {
    await gate(holdUploadsKey, "fixture:release-uploads");
    report.progress(100);
    report.checking();
    const dto: FileDto = { id: crypto.randomUUID(), filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, createdAt: new Date().toISOString(), replacedAt: null };
    report.started?.(dto.id);
    uploaded.set(dto.id, dto);
    return { success: true, data: dto };
  },
  attach: async (artifactId, fileIds) => {
    await gate(holdAttachKey, "fixture:release-attach");
    const next = takeFlag(nextAttachKey);
    if (next === "refuse") return { success: false, error: "The files could not be added. Try again." };
    if (next === "vanish" || next === "vanish-always") throw new Error("The answer was lost.");
    const current = readStored().find((entry) => entry.id === artifactId);
    if (!current) return { success: false, error: "Artifact not found." };
    // As the server does: a file already in this artifact is not added twice.
    const have = new Set(current.files.map((file) => file.id));
    const taking = next === "first-only-always" ? fileIds.slice(0, 1) : fileIds;
    const files = [...current.files, ...taking.flatMap((fileId) => (have.has(fileId) ? [] : (uploaded.get(fileId) ?? [])))];
    const result = save({ ...current, files, updatedAt: new Date().toISOString() });
    if (next === "lose" || next === "lose-always" || next === "first-only-always") throw new Error("The answer was lost.");
    return result;
  },
  replace: (artifactId, fileId, uploadId) => {
    const next = takeFlag(nextReplaceKey);
    if (next === "refuse") return Promise.resolve({ success: false, error: "The file changed while it was being replaced, so nothing was changed. Try again." });
    const current = readStored().find((entry) => entry.id === artifactId);
    const upload = uploaded.get(uploadId);
    if (!current || !upload) return Promise.resolve({ success: false, error: "File not found." });
    // As the server does: the entry keeps its id, place, and name; the upload is used up.
    const files = current.files.map((file) => (file.id === fileId ? { ...file, contentType: upload.contentType, size: upload.size, replacedAt: new Date().toISOString() } : file));
    uploaded.delete(uploadId);
    const saved = save({ ...current, files, updatedAt: new Date().toISOString() });
    const notice = next === "not-sent" ? approvalNotSentNotice : null;
    return Promise.resolve(saved.success ? { success: true, data: { artifact: saved.data, notice } } : saved);
  },
  discard: (fileId) => {
    // As the server does (discardUnattachedUpload): a file already in an artifact stays.
    if (attachedIds().has(fileId)) return Promise.resolve();
    uploaded.delete(fileId);
    recordDiscard(fileId);
    return Promise.resolve();
  },
  load: async (publicId) => {
    await gate(holdLoadKey, "fixture:release-load");
    // Set by a test so the check after a lost answer fails too.
    if (takeFlag(failLoadKey) !== null) throw new Error("The artifact could not be loaded.");
    const found = readStored().find((entry) => entry.publicId === publicId);
    return found ? { success: true, data: found } : { success: false, error: "Artifact not found." };
  },
};
