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

/** The create input for the blank page: the draft, the title or "Untitled", and the project the list is filtered to. */
export function createInputFor(draft: BlankDraft, project: string | null): ArtifactInput {
  return {
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
}

/**
 * Wraps the editor's save so the blank page is created exactly once. Calls
 * that arrive while the create is in flight wait for it and then save to the
 * stored artifact; a failed create leaves nothing behind and can be retried;
 * after the create every save goes to the stored artifact, even when the
 * caller still names the blank id.
 */
export function persistOnce({ current, create, update, project }: PersistOnceOptions): SaveCall {
  let created: ArtifactDto | null = null;
  let creating: Promise<SaveArtifactResult> | null = null;

  const runCreate = async (): Promise<SaveArtifactResult> => {
    const { draft, fileIds } = current();
    const result = await create(createInputFor(draft, project), [...fileIds]);
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
