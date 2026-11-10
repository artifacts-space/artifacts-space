import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { draftProblem } from "@/components/app/artifact-editor/autosave-rules";
import type { SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import type { ArtifactDraft } from "@/components/app/artifact-editor/use-artifact-draft";
import { deleteFileAction } from "@/app/(workspace)/app/file-actions";
import { useFileUploads } from "@/components/files/use-file-uploads";
import type { ArtifactDto, ArtifactKind } from "@/lib/artifact-types";
import { detectFileText, detectTextKind, filePlan, fileTitle, type Detection } from "@/lib/create/detect-kind-rules";
import { BLANK_ARTIFACT_ID, blankDraftProblem, isUntouched, persistOnce } from "@/lib/create/new-artifact-rules";

import type { NewArtifactApi } from "./new-artifact-api";
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

/** The title for dropped files when the page has none. */
function filesTitle(draft: ArtifactDraft, names: readonly string[]): string {
  if (draft.title.trim() !== "") return draft.title;
  const [first] = names;
  return names.length === 1 && first ? fileTitle(first) : `${String(names.length)} files`;
}

/** Reads one dropped file as text when its extension says it is code, SVG, or Mermaid; null when it should upload. */
async function readAsText(files: readonly File[]): Promise<Detection | null> {
  const [file] = files;
  if (files.length !== 1 || !file || file.size > maxReadBytes) return null;
  const plan = filePlan(file.name);
  if (!plan.read) return null;
  return detectFileText(file.name, await file.text(), plan);
}

/** True while the empty body still takes first content: files already dropped make it a Files artifact, so later pastes go to the editor as usual. */
function takesFirstContent(active: boolean, draft: ArtifactDraft, uploadCount: number): boolean {
  return active && draft.kind === "markdown" && draft.content.trim() === "" && uploadCount === 0;
}

/** The chip while the content is still as detected: any edit after detection, or a format change, hides it. */
function stillDetected(detected: DetectedFormat | null, draft: ArtifactDraft): DetectedFormat | null {
  return detected?.content === draft.content && detected.kind === draft.kind ? detected : null;
}

/** The editor's save for a blank page: created once (persistOnce), then ordinary saves. Built on first use. */
function useCreateOnceSave(api: NewArtifactApi | undefined, project: string | null, current: () => { draft: ArtifactDraft; fileIds: readonly string[] }) {
  const saverRef = useRef<SaveArtifact | null>(null);
  const currentRef = useRef(current);
  useEffect(() => { currentRef.current = current; }, [current]);
  const persist = useCallback<SaveArtifact>((id, changes, saveOptions) => {
    if (!api) return Promise.resolve({ success: false, error: "Nothing to save." });
    saverRef.current ??= persistOnce({ current: () => currentRef.current(), create: api.create, update: api.update, project });
    return saverRef.current(id, changes, saveOptions);
  }, [api, project]);
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
  const fileIdsRef = useRef<string[]>([]);
  const committedRef = useRef(false);
  const [detected, setDetected] = useState<DetectedFormat | null>(null);
  const [readFailed, setReadFailed] = useState<string | null>(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  const active = options !== undefined;
  const uploads = useFileUploads({ send: options?.api.send });
  const current = useCallback(() => ({ draft: draftRef.current, fileIds: fileIdsRef.current }), []);
  const save = useCreateOnceSave(options?.api, options?.project ?? null, current);

  const problem = useCallback((current: ArtifactDraft, base: ArtifactDraft) => (blank ? blankDraftProblem(current, draftProblem) : draftProblem(current, base)), [blank]);
  const idle = useCallback((current: ArtifactDraft) => blank && isUntouched(current, fileIdsRef.current), [blank]);

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

  const onContent = useCallback((content: FirstContent) => {
    setReadFailed(null);
    if ("text" in content) {
      apply(detectTextKind(content.text));
      return;
    }
    readAsText(content.files)
      .then((detection) => { if (detection) apply(detection); else uploads.addFiles(content.files); })
      .catch(() => { setReadFailed("That file could not be read. Try again, or upload it."); });
  }, [apply, uploads]);

  useCommitUploads({ options, artifact, uploads, fileIdsRef, committedRef, draftRef, replace, onUpdated });
  useForgetUnusedUploads(uploads.readyFiles, committedRef);

  const dismissDetected = useCallback(() => { setDetected(null); }, []);
  return {
    active,
    blank,
    save,
    problem,
    idle,
    onContent,
    eligible: takesFirstContent(active, draft, uploads.items.length),
    uploads,
    readFailed,
    detected: stillDetected(detected, draft),
    dismissDetected,
  };
}

interface CommitOptions {
  options: BlankPageOptions | undefined;
  artifact: ArtifactDto;
  uploads: ReturnType<typeof useFileUploads>;
  fileIdsRef: React.RefObject<string[]>;
  committedRef: React.RefObject<boolean>;
  draftRef: React.RefObject<ArtifactDraft>;
  replace: (draft: ArtifactDraft, remount: boolean) => void;
  onUpdated: (artifact: ArtifactDto) => void;
}

/**
 * Once every dropped file has finished, makes the page a Files artifact: a
 * blank page is created with them attached; a page already stored (a title
 * was typed first) gets them attached, then its format saves as Files.
 */
function useCommitUploads({ options, artifact, uploads, fileIdsRef, committedRef, draftRef, replace, onUpdated }: CommitOptions) {
  const ready = uploads.readyFiles;
  const readyKey = useMemo(() => ready.map((file) => file.id).join(","), [ready]);
  useEffect(() => {
    if (!options || committedRef.current || uploads.busy || readyKey === "") return;
    committedRef.current = true;
    const ids = readyKey.split(",");
    const names = ready.map((file) => file.filename);
    const asFiles = (current: ArtifactDraft): ArtifactDraft => ({ ...current, kind: "file", title: filesTitle(current, names) });
    if (artifact.id === BLANK_ARTIFACT_ID) {
      fileIdsRef.current = ids;
      replace(asFiles(draftRef.current), true);
      return;
    }
    options.api.attach(artifact.id, ids)
      .then((result) => {
        if (!result.success) { committedRef.current = false; return; }
        onUpdated(result.data);
        replace(asFiles(draftRef.current), true);
      })
      .catch(() => { committedRef.current = false; });
  }, [options, artifact.id, uploads.busy, readyKey, ready, fileIdsRef, committedRef, draftRef, replace, onUpdated]);
}

/** Leaving before dropped files became an artifact deletes those uploads; the cleanup job is the backstop. */
function useForgetUnusedUploads(ready: readonly { id: string }[], committedRef: React.RefObject<boolean>) {
  const readyRef = useRef(ready);
  useEffect(() => { readyRef.current = ready; }, [ready]);
  useEffect(() => () => {
    if (committedRef.current) return;
    for (const file of readyRef.current) void deleteFileAction(file.id).catch(() => undefined);
  }, [committedRef]);
}
