import type { ActionResult, ArtifactDto, ArtifactInput, ArtifactKind, SaveArtifactResult } from "@/lib/artifact-types";

/**
 * Rules for the blank page that New artifact opens. Nothing is stored until
 * the person puts something in it; then it is created once, through the
 * normal create path, and every later change is an ordinary save. Kept pure
 * so the rules are tested without a browser or a database.
 */

/** The id a new artifact has before it is created. No stored artifact has it. */
export const BLANK_ARTIFACT_ID = "new-artifact";

/** The title a new artifact gets when the person wrote content but no title. */
export const UNTITLED = "Untitled";

/** What a person can put on the blank page before it is created. */
export interface BlankDraft {
  title: string;
  icon: string | null;
  summary: string;
  content: string;
  language: string;
  kind: ArtifactKind;
}

/** True while the person has put nothing on the page, so there is nothing to store. */
export function isUntouched(draft: BlankDraft, fileIds: readonly string[] = []): boolean {
  return draft.title.trim() === "" && draft.content.trim() === "" && draft.summary.trim() === "" && draft.icon === null && fileIds.length === 0;
}

/**
 * Why the blank page cannot be created yet, or null when it can. A missing
 * title is fine (it becomes "Untitled"), and so is an empty Markdown body;
 * otherwise `check`, the editor's usual rule, decides, so the content must
 * fit its format as for any save.
 */
export function blankDraftProblem<T extends BlankDraft>(draft: T, check: (draft: T) => string | null): string | null {
  if (draft.kind === "markdown" && draft.content === "") return null;
  return check({ ...draft, title: draft.title.trim() || UNTITLED });
}

const webCreatePrefix = "web:";
const webCreateSession = /^web:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The session id a blank page's create carries: "web:" and a random id the
 * page picks once. A retry after a lost response carries the same one, so the
 * server hands back the artifact the first try stored instead of a second.
 */
export function webCreateSessionId(requestId: string): string {
  return `${webCreatePrefix}${requestId}`;
}

/** True for a session id a blank page's create sends (webCreateSessionId). */
export function isWebCreateSessionId(sessionId: string | undefined): sessionId is string {
  return sessionId !== undefined && webCreateSession.test(sessionId);
}

/** The create input for the blank page: the draft, the title or "Untitled", the project the list is filtered to, and the page's create id. */
export function createInputFor(draft: BlankDraft, project: string | null, requestId?: string): ArtifactInput {
  return {
    ...(requestId ? { sessionId: webCreateSessionId(requestId) } : {}),
    title: draft.title.trim() || UNTITLED,
    icon: draft.icon,
    summary: draft.summary,
    content: draft.content,
    kind: draft.kind,
    language: draft.language,
    project,
  };
}

/** One save of the editor: create the blank page, or change a stored artifact. */
export type SaveCall = (id: string, changes: Partial<BlankDraft>, options: { expectedUpdatedAt: string; session: "start" | "continue" }) => Promise<SaveArtifactResult>;

interface PersistOnceOptions {
  /** Reads the whole draft and the files to attach at the moment of creating. */
  current: () => { draft: BlankDraft; fileIds: readonly string[] };
  create: (input: ArtifactInput, fileIds: string[]) => Promise<ActionResult<ArtifactDto>>;
  update: SaveCall;
  /** The project the new artifact goes into, or null. */
  project: string | null;
  /** Picked once per blank page, so every try of its create is the same create (webCreateSessionId). */
  requestId: string;
}

/**
 * Wraps the editor's save so the blank page is created exactly once. Calls
 * that arrive while the create is in flight wait for it and then save to the
 * stored artifact; a failed create can be retried, and every try carries the
 * same create id, so a retry after a lost response finds the first one;
 * after the create every save goes to the stored artifact, even when the
 * caller still names the blank id.
 */
export function persistOnce({ current, create, update, project, requestId }: PersistOnceOptions): SaveCall {
  let created: ArtifactDto | null = null;
  let creating: Promise<SaveArtifactResult> | null = null;

  const runCreate = async (): Promise<SaveArtifactResult> => {
    const { draft, fileIds } = current();
    const result = await create(createInputFor(draft, project, requestId), [...fileIds]);
    if (result.success) created = result.data;
    return result;
  };

  return async (id, changes, options) => {
    if (creating) {
      const first = await creating;
      // The first call already carried the whole draft; this one only saves what changed since, below.
      if (!first.success) return first;
    }
    if (created) {
      const target = id === BLANK_ARTIFACT_ID ? created : null;
      if (target) return update(target.id, changes, { ...options, expectedUpdatedAt: target.updatedAt });
      return update(id, changes, options);
    }
    creating = runCreate().finally(() => { creating = null; });
    return creating;
  };
}

/** What the blank page does next with files dropped on it. */
export type UploadStep =
  | { step: "none" }
  | { step: "wait" }
  | { step: "create"; ids: string[] }
  | { step: "attach"; ids: string[] }
  | { step: "done" };

interface UploadState {
  /** The artifact is stored (it has a real id). */
  stored: boolean;
  /** Some files are still uploading or being checked. */
  busy: boolean;
  /** Finished uploads, in order. */
  readyIds: readonly string[];
  /** Files the stored artifact already has. */
  attachedIds: readonly string[];
  /** Files already handed to the create, which attaches them. */
  handedIds: readonly string[];
}

/**
 * The next step for dropped files, once every upload has finished: hand them
 * to the create while the page is blank; attach any the stored artifact does
 * not have (also files that finished while the create was already on its
 * way, which it could not carry); done once it has them all.
 */
export function uploadStep({ stored, busy, readyIds, attachedIds, handedIds }: UploadState): UploadStep {
  if (readyIds.length === 0) return { step: busy ? "wait" : "none" };
  if (busy) return { step: "wait" };
  const attached = new Set(attachedIds);
  const pending = readyIds.filter((id) => !attached.has(id));
  if (pending.length === 0) return { step: "done" };
  if (stored) return { step: "attach", ids: pending };
  const handed = new Set(handedIds);
  const fresh = pending.filter((id) => !handed.has(id));
  return fresh.length === 0 ? { step: "wait" } : { step: "create", ids: fresh };
}

/** The new artifact's page, as far as a paste or drop needs to know. */
export interface PageForContent {
  /** The editor shows the New artifact pane (before and after the create). */
  active: boolean;
  kind: string;
  content: string;
  /** Files dropped on the page that have not reached the artifact yet. */
  uploadCount: number;
}

/** True while the empty body still takes first content: an empty Markdown body, with no dropped files on their way. */
export function takesFirstContent({ active, kind, content, uploadCount }: PageForContent): boolean {
  return active && kind === "markdown" && content.trim() === "" && uploadCount === 0;
}

/** What the page does with a paste or drop: read it as first content, upload and attach the files, or leave it to the editor. */
export type ContentRoute = "first" | "upload" | "ignore";

/**
 * Routes a paste or drop on the New artifact pane. Only an empty Markdown
 * body takes first content, which may pick the format. Any other file
 * dropped there uploads and is attached to the artifact (uploadStep), in
 * every format, created first when it is not stored yet; it is never read
 * into the body, so writing is never replaced. Other text is an ordinary
 * paste for the editor.
 */
export function contentRoute(isText: boolean, page: PageForContent): ContentRoute {
  if (takesFirstContent(page)) return "first";
  return !isText && page.active ? "upload" : "ignore";
}
