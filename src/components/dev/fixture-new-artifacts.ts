import type { NewArtifactApi } from "@/components/app/new-artifact/new-artifact-api";
import { validateArtifactContent } from "@/lib/artifact-content";
import type { ActionResult, ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";

import { fixtureArtifact } from "./fixture-content";

/**
 * The /dev/workspace fixture's stand-in for storing new artifacts: kept in
 * this tab's sessionStorage, so a reload shows what was stored (and only
 * that), and counted, so the e2e checks can prove a page was created once.
 * It refuses what the server refuses: content that does not fit its format.
 */

const artifactsKey = "fixture:new-artifacts";
const createsKey = "fixture:new-artifact-creates";
/** Set to "1" by a test to make the next create fail, as a lost connection or a rate limit would. */
const failNextKey = "fixture:fail-next-create";

function takeFailure(): boolean {
  try {
    if (window.sessionStorage.getItem(failNextKey) !== "1") return false;
    window.sessionStorage.removeItem(failNextKey);
    return true;
  } catch {
    return false;
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

function contentProblem(kind: ArtifactKind, content: string, emptyMarkdown: boolean): string | null {
  const check = validateArtifactContent(kind, content, { emptyMarkdown });
  return check.valid ? null : check.message;
}

const uploaded = new Map<string, FileDto>();
let created = 0;

function save(next: ArtifactDto): ActionResult<ArtifactDto> {
  writeStored([next, ...readStored().filter((entry) => entry.id !== next.id)]);
  return { success: true, data: next };
}

/** The fixture's NewArtifactApi. */
export const fixtureNewArtifactApi: NewArtifactApi = {
  create: (input, fileIds) => {
    const kind = input.kind ?? "markdown";
    const problem = contentProblem(kind, input.content, true);
    if (problem) return Promise.resolve({ success: false, error: problem });
    if (takeFailure()) return Promise.resolve({ success: false, error: "You have made a lot of artifacts in a short time. Try again in a minute." });
    countCreate();
    created += 1;
    const now = new Date().toISOString();
    const id = `fixture-new-${String(Date.now())}-${String(created)}`;
    const base = fixtureArtifact({ id, kind, title: input.title, content: input.content, publicId: `fixturenew${String(Date.now()).slice(-10)}${String(created).padStart(2, "0")}`, updatedAt: now });
    const files = fileIds.flatMap((fileId) => uploaded.get(fileId) ?? []);
    return Promise.resolve(save({ ...base, summary: input.summary ?? "", language: input.language ?? "", icon: input.icon ?? null, files }));
  },
  update: (id, changes) => {
    const current = readStored().find((entry) => entry.id === id);
    if (!current) return Promise.resolve({ success: false, error: "Artifact not found." });
    const next = { ...current, ...changes, updatedAt: new Date().toISOString() };
    const touchesContent = changes.content !== undefined || changes.kind !== undefined;
    const problem = touchesContent ? contentProblem(next.kind, next.content, false) : null;
    if (problem) return Promise.resolve({ success: false, error: problem });
    return Promise.resolve(save(next));
  },
  send: (file, report) => {
    report.progress(100);
    report.checking();
    const dto: FileDto = { id: crypto.randomUUID(), filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, createdAt: new Date().toISOString() };
    uploaded.set(dto.id, dto);
    return Promise.resolve({ success: true, data: dto });
  },
  attach: (artifactId, fileIds) => {
    const current = readStored().find((entry) => entry.id === artifactId);
    if (!current) return Promise.resolve({ success: false, error: "Artifact not found." });
    const files = [...current.files, ...fileIds.flatMap((fileId) => uploaded.get(fileId) ?? [])];
    return Promise.resolve(save({ ...current, files, updatedAt: new Date().toISOString() }));
  },
  discard: (fileId) => {
    uploaded.delete(fileId);
    return Promise.resolve();
  },
};
