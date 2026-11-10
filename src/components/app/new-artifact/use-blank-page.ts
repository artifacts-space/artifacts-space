import { useCallback, useEffect, useRef, useState } from "react";

import { draftProblem } from "@/components/app/artifact-editor/autosave-rules";
import type { SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import type { ArtifactDraft } from "@/components/app/artifact-editor/use-artifact-draft";
import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import { detectFileText, detectTextKind, filePlan, type Detection } from "@/lib/create/detect-kind-rules";
import { BLANK_ARTIFACT_ID, blankDraftProblem, contentRoute, isUntouched, persistOnce, takesFirstContent, type PageForContent } from "@/lib/create/new-artifact-rules";

import type { NewArtifactApi } from "./new-artifact-api";
import { useBlankUploads, type CreateTracker } from "./use-blank-uploads";
import type { FirstContent } from "./use-first-content";

/** Set on the editor when it shows a new artifact that may not be stored yet. */
export interface BlankPageOptions {
  api: NewArtifactApi;
  /** The project the list is filtered to, for the new artifact; null for none. */
  project: string | null;
}

/** The chip that names a detected format, until the next edit. */
export interface DetectedFormat {
  kind: ArtifactKind;
  language: string;
  /** The content as detected: any edit after it hides the chip. */
  content: string;
}

interface EditorHandles {
  artifact: ArtifactDto;
  draft: ArtifactDraft;
  replace: (draft: ArtifactDraft, remount: boolean) => void;
  onUpdated: (artifact: ArtifactDto) => void;
}

/** Largest file read into the body as text; bigger ones upload as files. */
const maxReadBytes = 1_000_000;

/** The draft after first content was detected: the format, the content as kept, and a title when the page has none. */
function withDetection(draft: ArtifactDraft, detection: Detection): ArtifactDraft {
  const title = draft.title.trim() === "" && detection.title ? detection.title : draft.title;
  return { ...draft, kind: detection.kind, language: detection.language || draft.language, content: detection.content, title };
}

/** Reads one dropped file as text when its extension says it is code, SVG, or Mermaid; null when it should upload. */
async function readAsText(files: readonly File[]): Promise<Detection | null> {
  const [file] = files;
  if (files.length !== 1 || !file || file.size > maxReadBytes) return null;
  const plan = filePlan(file.name);
  if (!plan.read) return null;
  return detectFileText(file.name, await file.text(), plan);
}


/** The chip while the content is still as detected: any edit after detection, or a format change, hides it. */
function stillDetected(detected: DetectedFormat | null, draft: ArtifactDraft): DetectedFormat | null {
  return detected?.content === draft.content && detected.kind === draft.kind ? detected : null;
}

/**
 * After a create refused once the page is gone, deletes the files it carried,
 * unless another create started: the editor's last save, queued while this
 * one was on its way, runs right after this answer and carries the same files.
 * That retry deletes them itself if it is refused too.
 */
function discardAfterRefusal(api: NewArtifactApi, tracker: CreateTracker, fileIds: readonly string[]) {
  const attempts = tracker.read().attempts;
  window.setTimeout(() => {
    const standing = tracker.read();
    if (standing.state !== "failed" || standing.attempts !== attempts) return;
    for (const id of fileIds) void api.discard(id).catch(() => undefined);
  }, 0);
}

/**
 * The page's create, keeping `tracker` up to date: what may be deleted when
 * the page goes depends on it (uploadsToDiscard). A create refused after the
 * page is gone deletes the files it carried once no retry follows
 * (discardAfterRefusal); a lost answer keeps them for the cleanup job.
 */
function trackedCreate(api: NewArtifactApi, tracker: CreateTracker): NewArtifactApi["create"] {
  return (input, fileIds, requestId) => {
    tracker.set("inFlight");
    return api.create(input, fileIds, requestId).then(
      (result) => {
        tracker.set(result.success ? "stored" : "failed");
        if (!result.success && !tracker.read().mounted) discardAfterRefusal(api, tracker, fileIds);
        return result;
      },
      (error: unknown) => {
        tracker.set("unknown");
        throw error;
      },
    );
  };
}

/** The editor's save for a blank page: created once (persistOnce), then ordinary saves. Built on first use. */
function useCreateOnceSave(api: NewArtifactApi | undefined, project: string | null, current: () => { draft: ArtifactDraft; fileIds: readonly string[] }, tracker: CreateTracker) {
  const saverRef = useRef<SaveArtifact | null>(null);
  // One create id per blank page, so a retry after a lost response is the same create (artifact.create_request_id).
  const [requestId] = useState(() => crypto.randomUUID());
  const currentRef = useRef(current);
  useEffect(() => { currentRef.current = current; }, [current]);
  const persist = useCallback<SaveArtifact>((id, changes, saveOptions) => {
    if (!api) return Promise.resolve({ success: false, error: "Nothing to save." });
    saverRef.current ??= persistOnce({ current: () => currentRef.current(), create: trackedCreate(api, tracker), update: api.update, project, requestId });
    return saverRef.current(id, changes, saveOptions);
  }, [api, project, requestId, tracker]);
  return api ? persist : undefined;
}

/**
 * Turns the editor into the blank page New artifact opens, while `options`
 * is set: nothing is stored until the person puts something in it, then it
 * is created once (persistOnce) and every later change is an ordinary save.
 * The first text pasted or dropped into the empty body picks the format
 * (detectTextKind); dropped files upload and make a Files artifact.
 */
export function useBlankPage(options: BlankPageOptions | undefined, editor: EditorHandles) {
  const { artifact, draft, replace, onUpdated } = editor;
  const blank = options !== undefined && artifact.id === BLANK_ARTIFACT_ID;
  const draftRef = useRef(draft);
  const [detected, setDetected] = useState<DetectedFormat | null>(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  const active = options !== undefined;
  const { uploads, fileIdsForCreate, removeUpload, problem: uploadProblem, tracker } = useBlankUploads({ options, artifact, draftRef, replace, onUpdated });
  const current = useCallback(() => ({ draft: draftRef.current, fileIds: fileIdsForCreate() }), [fileIdsForCreate]);
  const save = useCreateOnceSave(options?.api, options?.project ?? null, current, tracker);

  const problem = useCallback((current: ArtifactDraft, base: ArtifactDraft) => (blank ? blankDraftProblem(current, draftProblem) : draftProblem(current, base)), [blank]);
  const idle = useCallback((current: ArtifactDraft) => blank && isUntouched(current, fileIdsForCreate()), [blank, fileIdsForCreate]);

  // Created with no title: the draft takes the stored "Untitled", so the next save does not send an empty title.
  const stored = active && !blank;
  useEffect(() => {
    if (!stored || draftRef.current.title.trim() !== "") return;
    replace({ ...draftRef.current, title: artifact.title }, false);
  }, [stored, artifact.title, replace]);

  const apply = useCallback((detection: Detection) => {
    replace(withDetection(draftRef.current, detection), true);
    setDetected(detection.kind === "markdown" ? null : { kind: detection.kind, language: detection.language, content: detection.content });
  }, [replace]);

  // First content only while the body is empty; any other file dropped on this page uploads and is attached (contentRoute, uploadStep).
  const uploadCount = uploads.items.length;
  const eligible = takesFirstContent({ active, kind: draft.kind, content: draft.content, uploadCount });
  const routeRef = useRef<PageForContent>({ active, kind: draft.kind, content: draft.content, uploadCount });
  useEffect(() => { routeRef.current = { active, kind: draft.kind, content: draft.content, uploadCount }; }, [active, draft.kind, draft.content, uploadCount]);

  const onContent = useCallback((content: FirstContent) => {
    const route = contentRoute("text" in content, routeRef.current);
    if (route === "ignore") return;
    if ("text" in content) {
      apply(detectTextKind(content.text));
      return;
    }
    if (route === "upload") {
      uploads.addFiles(content.files);
      return;
    }
    readAsText(content.files)
      // Typed into while the file was read: the writing stays, and the file uploads instead.
      .then((detection) => { if (detection && takesFirstContent(routeRef.current)) apply(detection); else uploads.addFiles(content.files); })
      // Not readable as text: it still uploads, as any other file would.
      .catch(() => { uploads.addFiles(content.files); });
  }, [apply, uploads]);

  const dismissDetected = useCallback(() => { setDetected(null); }, []);
  return {
    active,
    blank,
    save,
    problem,
    idle,
    onContent,
    eligible,
    takesFiles: active,
    uploads,
    removeUpload,
    filesProblem: uploadProblem,
    detected: stillDetected(detected, draft),
    dismissDetected,
  };
}
