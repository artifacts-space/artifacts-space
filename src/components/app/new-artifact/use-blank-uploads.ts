import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ArtifactDraft } from "@/components/app/artifact-editor/use-artifact-draft";
import { useLeaveGuard } from "@/components/artifact-page/use-leave-guard";
import { useFileUploads } from "@/components/files/use-file-uploads";
import type { ArtifactDto } from "@/lib/artifact-types";
import { fileTitle } from "@/lib/create/detect-kind-rules";
import { BLANK_ARTIFACT_ID, filesForCreate, uploadsToDiscard, uploadStep, type CreateState } from "@/lib/create/new-artifact-rules";

import type { BlankPageOptions } from "./use-blank-page";

/** How the blank page's create stands, kept by its save (useBlankPage) and read here. */
interface CreateStanding {
  state: CreateState;
  /** False once the page is gone: a create refused after that deletes the files it carried. */
  mounted: boolean;
  /** Creates sent so far, so the check after the page goes can tell whether its last save tried again. */
  attempts: number;
}

/** Reads and sets how the create stands. */
export interface CreateTracker {
  read: () => CreateStanding;
  set: (state: CreateState) => void;
}

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

type Uploads = ReturnType<typeof useFileUploads>;
type Api = BlankPageOptions["api"];

/** Deletes uploads that reached no artifact; the server leaves any file already in one alone (discardUploadAction). */
function discardAll(api: Api | undefined, ids: readonly string[]) {
  for (const id of ids) void api?.discard(id).catch(() => undefined);
}

/** Attaches finished files to the stored artifact. A refusal deletes them; a lost answer keeps them, since they may be in the artifact. */
function useAttach(api: Api | undefined, uploadsRef: React.RefObject<Uploads>, holdRef: React.RefObject<Set<string>>, onAttached: (artifact: ArtifactDto) => void) {
  const [problem, setProblem] = useState<string | null>(null);
  const attachingRef = useRef(false);
  const attach = useCallback((artifactId: string, ids: readonly string[]) => {
    if (!api || attachingRef.current) return;
    attachingRef.current = true;
    for (const id of ids) holdRef.current.add(id);
    const dropFromList = () => {
      for (const item of uploadsRef.current.items) if (item.file && ids.includes(item.file.id)) uploadsRef.current.remove(item.key, { deleteUpload: false });
    };
    api.attach(artifactId, [...ids])
      .then((result) => {
        if (!result.success) {
          // Refused: the files are in no artifact, so they go.
          for (const id of ids) holdRef.current.delete(id);
          setProblem(attachFailed);
          dropFromList();
          discardAll(api, ids);
          return;
        }
        for (const id of ids) holdRef.current.delete(id);
        setProblem(null);
        onAttached(result.data);
      })
      .catch(() => {
        // The answer was lost: the files may be in the artifact, so they stay held and are never deleted from here.
        setProblem(attachFailed);
        dropFromList();
      })
      .finally(() => { attachingRef.current = false; });
  }, [api, holdRef, onAttached, uploadsRef]);
  return { attach, problem };
}

/**
 * Files dropped on the blank page, from upload to artifact (uploadStep): the
 * create carries them while the page is blank; a page already stored gets
 * them attached, including any that finished while the create was on its
 * way. Once the artifact has them all, the list clears, so later files go
 * through the artifact's own Files section. Removing a file takes it out of
 * the create too (filesForCreate); a Files page that loses all its files
 * goes back to a blank page. Leaving while files upload asks first. Uploads
 * that never reached an artifact are deleted when the page goes
 * (uploadsToDiscard); the cleanup job is the backstop.
 */
export function useBlankUploads({ options, artifact, draftRef, replace, onUpdated }: BlankUploadsOptions) {
  const api = options?.api;
  const uploads = useFileUploads({ send: api?.send });
  const standingRef = useRef<CreateStanding>({ state: "none", mounted: true, attempts: 0 });
  /** Counts creates that came back, so the page can settle what waited for them. */
  const [settled, setSettled] = useState(0);
  const tracker = useMemo<CreateTracker>(() => ({
    read: () => standingRef.current,
    set: (state) => {
      standingRef.current.state = state;
      if (state === "inFlight") standingRef.current.attempts += 1;
      else setSettled((count) => count + 1);
    },
  }), []);
  /** Files handed to the create, which attaches them on the server. */
  const handedRef = useRef<{ ids: string[] }>({ ids: [] });
  /** Files whose attach is on its way or whose answer was lost. */
  const holdRef = useRef(new Set<string>());
  /** The draft the drop turned into a Files page, so removing every file can turn it back. */
  const filesDraftRef = useRef<ArtifactDraft | null>(null);
  const uploadsRef = useRef(uploads);
  useEffect(() => { uploadsRef.current = uploads; }, [uploads]);
  const attached = useCallback((result: ArtifactDto) => {
    onUpdated(result);
    const next = asFiles(draftRef.current, result.files.map((file) => file.filename));
    if (next) replace(next, false);
  }, [draftRef, onUpdated, replace]);
  const { attach, problem } = useAttach(api, uploadsRef, holdRef, attached);

  const readyKey = useMemo(() => uploads.readyFiles.map((file) => file.id).join(","), [uploads.readyFiles]);
  const attachedKey = useMemo(() => artifact.files.map((file) => file.id).join(","), [artifact.files]);
  const stored = artifact.id !== BLANK_ARTIFACT_ID;
  const itemCount = uploads.items.length;

  useEffect(() => {
    if (!api) return;
    const files = uploadsRef.current.readyFiles;
    const step = uploadStep({ stored, busy: uploadsRef.current.busy, readyIds: files.map((file) => file.id), attachedIds: attachedKey === "" ? [] : attachedKey.split(","), handedIds: handedRef.current.ids });
    if (step.step === "done") {
      uploadsRef.current.reset();
      return;
    }
    if (step.step === "attach") {
      attach(artifact.id, step.ids);
      return;
    }
    if (step.step !== "create") return;
    handedRef.current.ids = [...new Set([...handedRef.current.ids, ...step.ids])];
    // No remount: the empty body has no content editor to reload, and the title keeps its caret.
    const next = asFiles(draftRef.current, files.map((file) => file.filename));
    if (!next) return;
    filesDraftRef.current = next;
    replace(next, false);
  }, [api, stored, artifact.id, uploads.busy, readyKey, attachedKey, attach, draftRef, replace]);

  // Every file removed before the create: the page is blank again, not an empty Files artifact.
  // Not while a create is on its way: it may still store the Files page, and the draft must match what comes back.
  useEffect(() => {
    const auto = filesDraftRef.current;
    if (stored || itemCount > 0 || !auto || standingRef.current.state === "inFlight") return;
    filesDraftRef.current = null;
    const draft = draftRef.current;
    if (draft.kind !== "file" || draft.content !== "") return;
    replace({ ...draft, kind: "markdown", title: draft.title === auto.title ? "" : draft.title }, true);
  }, [stored, itemCount, settled, draftRef, replace]);

  /** Removes a file from the page and from the create; its upload goes unless a create on its way may carry it. */
  const removeUpload = useCallback((key: string) => {
    const item = uploadsRef.current.items.find((entry) => entry.key === key);
    uploadsRef.current.remove(key, { deleteUpload: false });
    const id = item?.file?.id;
    if (!id || holdRef.current.has(id)) return;
    const { state } = tracker.read();
    const carried = handedRef.current.ids.includes(id) && state !== "none" && state !== "failed";
    if (!carried) discardAll(api, [id]);
  }, [api, tracker]);

  /** The files the create carries now: handed and still on the page. */
  const fileIdsForCreate = useCallback(() => filesForCreate(handedRef.current.ids, uploadsRef.current.readyFiles.map((file) => file.id)), []);

  useLeaveGuard(uploads.busy);
  useForgetUnusedUploads({ api, ready: uploads.readyFiles, attachedKey, handedRef, holdRef, standingRef });
  return { uploads, fileIdsForCreate, removeUpload, problem, tracker };
}

interface ForgetOptions {
  api: Api | undefined;
  ready: readonly { id: string }[];
  attachedKey: string;
  handedRef: React.RefObject<{ ids: string[] }>;
  holdRef: React.RefObject<Set<string>>;
  standingRef: React.RefObject<CreateStanding>;
}

/**
 * When the page goes, deletes the uploads that reached no artifact
 * (uploadsToDiscard). A create still on its way when the page goes (the
 * editor's last save) deletes the files it carried only if it is refused.
 */
function useForgetUnusedUploads({ api, ready, attachedKey, handedRef, holdRef, standingRef }: ForgetOptions) {
  const latest = useRef({ api, ready, attachedKey });
  useEffect(() => { latest.current = { api, ready, attachedKey }; }, [api, ready, attachedKey]);
  useEffect(() => {
    const standing = standingRef.current;
    const handed = handedRef.current;
    const hold = holdRef.current;
    standing.mounted = true;
    return () => {
      standing.mounted = false;
      const { api: current, ready: files, attachedKey: attachedNow } = latest.current;
      const state = { readyIds: files.map((file) => file.id), attachedIds: attachedNow.split(","), handedIds: handed.ids, holdIds: [...hold] };
      // The editor's last save runs as it unmounts and may retry a refused create with these files, so they stay for now.
      const now = uploadsToDiscard({ ...state, create: standing.state === "failed" ? "inFlight" : standing.state });
      discardAll(current, now);
      if (standing.state !== "failed") return;
      const attempts = standing.attempts;
      // No retry started: the refusal stands, so the files it carried go too. A retry deletes them itself if refused (trackedCreate).
      window.setTimeout(() => {
        if (standing.state !== "failed" || standing.attempts !== attempts) return;
        const later = uploadsToDiscard({ ...state, create: "failed" }).filter((id) => !now.includes(id));
        discardAll(current, later);
      }, 0);
    };
  }, [handedRef, holdRef, standingRef]);
}
