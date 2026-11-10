import { useEffect, useMemo, useRef, useState } from "react";

import type { ArtifactDraft } from "@/components/app/artifact-editor/use-artifact-draft";
import { useFileUploads } from "@/components/files/use-file-uploads";
import type { ArtifactDto } from "@/lib/artifact-types";
import { fileTitle } from "@/lib/create/detect-kind-rules";
import { BLANK_ARTIFACT_ID, uploadStep } from "@/lib/create/new-artifact-rules";

import type { BlankPageOptions } from "./use-blank-page";

interface BlankUploadsOptions {
  options: BlankPageOptions | undefined;
  artifact: ArtifactDto;
  draftRef: React.RefObject<ArtifactDraft>;
  replace: (draft: ArtifactDraft, remount: boolean) => void;
  onUpdated: (artifact: ArtifactDto) => void;
}

/** The title for dropped files when the page has none. */
function filesTitle(draft: ArtifactDraft, names: readonly string[]): string {
  if (draft.title.trim() !== "") return draft.title;
  const [first] = names;
  return names.length === 1 && first ? fileTitle(first) : `${String(names.length)} files`;
}

/** An empty Markdown page becomes a Files artifact named after its files; a page with writing keeps its format and gets the files attached. */
function asFiles(draft: ArtifactDraft, names: readonly string[]): ArtifactDraft | null {
  if (draft.kind !== "markdown" || draft.content.trim() !== "") return null;
  return { ...draft, kind: "file", title: filesTitle(draft, names) };
}

const attachFailed = "The files could not be added. Drop them again to try once more.";

/**
 * Files dropped on the blank page, from upload to artifact (uploadStep): the
 * create carries them while the page is blank; a page already stored gets
 * them attached, including any that finished while the create was on its
 * way. Once the artifact has them all, the list clears, so later files go
 * through the artifact's own Files section. Uploads that never reached an
 * artifact are deleted when the page goes; the cleanup job is the backstop.
 */
export function useBlankUploads({ options, artifact, draftRef, replace, onUpdated }: BlankUploadsOptions) {
  const uploads = useFileUploads({ send: options?.api.send });
  const [problem, setProblem] = useState<string | null>(null);
  /** Files handed to the create, which attaches them on the server. persistOnce reads it when the create starts. */
  const fileIdsRef = useRef<string[]>([]);
  const attachingRef = useRef(false);
  const uploadsRef = useRef(uploads);
  useEffect(() => { uploadsRef.current = uploads; }, [uploads]);

  const ready = uploads.readyFiles;
  const readyKey = useMemo(() => ready.map((file) => file.id).join(","), [ready]);
  const attachedKey = useMemo(() => artifact.files.map((file) => file.id).join(","), [artifact.files]);
  const stored = artifact.id !== BLANK_ARTIFACT_ID;
  const api = options?.api;

  useEffect(() => {
    if (!api) return;
    const files = uploadsRef.current.readyFiles;
    const names = files.map((file) => file.filename);
    const step = uploadStep({ stored, busy: uploadsRef.current.busy, readyIds: files.map((file) => file.id), attachedIds: attachedKey === "" ? [] : attachedKey.split(","), handedIds: fileIdsRef.current });
    if (step.step === "done") {
      uploadsRef.current.reset();
      return;
    }
    if (step.step === "create") {
      fileIdsRef.current = [...fileIdsRef.current, ...step.ids];
      const next = asFiles(draftRef.current, names);
      if (next) replace(next, true);
      return;
    }
    if (step.step !== "attach" || attachingRef.current) return;
    attachingRef.current = true;
    const failed = () => {
      setProblem(attachFailed);
      for (const item of uploadsRef.current.items) {
        if (!item.file || !step.ids.includes(item.file.id)) continue;
        uploadsRef.current.remove(item.key, { deleteUpload: false });
        void api.discard(item.file.id).catch(() => undefined);
      }
    };
    api.attach(artifact.id, step.ids)
      .then((result) => {
        if (!result.success) { failed(); return; }
        setProblem(null);
        onUpdated(result.data);
        const next = asFiles(draftRef.current, names);
        if (next) replace(next, true);
      })
      .catch(failed)
      .finally(() => { attachingRef.current = false; });
  }, [api, stored, artifact.id, uploads.busy, readyKey, attachedKey, draftRef, replace, onUpdated]);

  useForgetUnusedUploads(api, ready, attachedKey, fileIdsRef);
  return { uploads, fileIdsRef, problem };
}

/** On leaving, deletes finished uploads that neither the create carried nor the artifact has. */
function useForgetUnusedUploads(api: BlankPageOptions["api"] | undefined, ready: readonly { id: string }[], attachedKey: string, handedRef: React.RefObject<string[]>) {
  const latest = useRef({ api, ready, attachedKey });
  useEffect(() => { latest.current = { api, ready, attachedKey }; }, [api, ready, attachedKey]);
  useEffect(() => () => {
    const { api: current, ready: files, attachedKey: attached } = latest.current;
    const kept = new Set([...attached.split(","), ...handedRef.current]);
    for (const file of files) if (!kept.has(file.id)) void current?.discard(file.id).catch(() => undefined);
  }, [handedRef]);
}
