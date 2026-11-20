import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLeaveGuard } from "@/components/artifact-page/use-leave-guard";
import { useFileUploads } from "@/components/files/use-file-uploads";
import type { ArtifactDto } from "@/lib/artifact-types";
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
  onUpdated: (artifact: ArtifactDto) => void;
}

const attachFailed = "The files could not be added. Drop them again to try once more.";
/**
 * The answers were lost and the artifact, loaded again, has only some of them:
 * its list of attached files shows which. Defensive: attachFiles is all-or-nothing
 * today, so this needs a future attach that is not, or a batch with ids the
 * artifact already held (which uploadStep rules out).
 */
const attachPartial = "Some files could not be added. The attached files list shows the ones that were; drop the others again.";
/** The answers were lost and the artifact could not be loaded either, so its list of attached files may be out of date. */
const attachUnknownStale = "We could not confirm the files were added. Reload the page and check its attached files before adding them again.";

type Uploads = ReturnType<typeof useFileUploads>;
type Api = BlankPageOptions["api"];

/** Deletes uploads that reached no artifact; the server leaves any file already in one alone (discardUploadAction). */
function discardAll(api: Api | undefined, ids: readonly string[]) {
  for (const id of ids) void api?.discard(id).catch(() => undefined);
}

type AttachResult = Awaited<ReturnType<Api["attach"]>>;

/**
 * Attaches once and, when the answer is lost, asks once more (after
 * `onLost`): attaching files already in the artifact changes nothing and
 * answers with the artifact, so the second answer says what happened. Null
 * when both answers were lost.
 */
async function attachWithRecheck(api: Api, artifactId: string, ids: readonly string[], onLost: () => void): Promise<AttachResult | null> {
  try {
    return await api.attach(artifactId, [...ids]);
  } catch {
    onLost();
    return api.attach(artifactId, [...ids]).catch(() => null);
  }
}

/** What the page learned after every attach answer was lost. */
interface Settled {
  /** The artifact as it is now, or null when it could not be loaded. */
  loaded: ArtifactDto | null;
  /** The files the loaded artifact holds. */
  landed: string[];
  /** Files the loaded artifact does not hold: known not to be in it, so they can go (the delete is guarded). */
  missing: string[];
  /** What to tell the person; null when the artifact holds every file. */
  message: string | null;
}

/** After every attach answer was lost: loads the artifact as it is now, so its list of attached files can show the truth. */
async function settleUnknownAttach(api: Api, publicId: string, ids: readonly string[]): Promise<Settled> {
  const result = await api.load(publicId).catch(() => null);
  if (!result?.success) return { loaded: null, landed: [], missing: [], message: attachUnknownStale };
  const have = new Set(result.data.files.map((file) => file.id));
  const landed = ids.filter((id) => have.has(id));
  const missing = ids.filter((id) => !have.has(id));
  if (missing.length === 0) return { loaded: result.data, landed, missing, message: null };
  return { loaded: result.data, landed, missing, message: landed.length > 0 ? attachPartial : attachFailed };
}

/**
 * Attaches finished files to the stored artifact. A refusal deletes them
 * (they are in no artifact). A lost answer is checked once more
 * (attachWithRecheck) and, if it stays unknown, the artifact is loaded again
 * (settleUnknownAttach): files it holds are done, files it lacks go (the
 * delete is guarded, so a late attach keeps its file), and if it cannot be
 * loaded the files are kept, held, and never deleted from here. Until the
 * outcome is known the files show as Checking and new drops wait; every way
 * out takes them off the list (the finally), so the list is never left busy.
 * `round` changes after each attach, so files that finished meanwhile are
 * taken next. A `problem` stays until the person drops files again
 * (`clearProblem`): a later attach that went well says nothing about the
 * files that did not, and when it followed at once (a file dropped while
 * the refused one was on its way) it took the message away before anyone
 * could read it.
 */
function useAttach(api: Api | undefined, uploadsRef: React.RefObject<Uploads>, holdRef: React.RefObject<Set<string>>, onUpdated: (artifact: ArtifactDto) => void) {
  const [problem, setProblem] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const attachingRef = useRef(false);
  const attach = useCallback((stored: { id: string; publicId: string }, ids: readonly string[]) => {
    if (!api || attachingRef.current) return;
    attachingRef.current = true;
    for (const id of ids) holdRef.current.add(id);
    const dropFromList = () => {
      for (const item of uploadsRef.current.items) if (item.file && ids.includes(item.file.id)) uploadsRef.current.remove(item.key, { deleteUpload: false });
    };
    const settle = async () => {
      const settled = await settleUnknownAttach(api, stored.publicId, ids);
      // Known either way once loaded: files it holds are done, files it lacks go. Unloaded, they stay held.
      for (const id of [...settled.landed, ...settled.missing]) holdRef.current.delete(id);
      discardAll(api, settled.missing);
      if (settled.loaded) onUpdated(settled.loaded);
      if (settled.message) setProblem(settled.message);
    };
    void attachWithRecheck(api, stored.id, ids, () => { uploadsRef.current.markChecking(ids); })
      .then(async (result) => {
        if (!result) {
          await settle();
          return;
        }
        for (const id of ids) holdRef.current.delete(id);
        if (result.success) {
          onUpdated(result.data);
          return;
        }
        // Refused: the files are in no artifact, so they go.
        setProblem(attachFailed);
        discardAll(api, ids);
      })
      .finally(() => {
        // Every way out, including an attach that answered after a lost one: the files leave the list, so it is never stuck busy.
        dropFromList();
        attachingRef.current = false;
        setRound((count) => count + 1);
      });
  }, [api, holdRef, onUpdated, uploadsRef]);
  const clearProblem = useCallback(() => { setProblem(null); }, []);
  return { attach, problem, clearProblem, round };
}

/**
 * Files dropped on a new page that is not a document, from upload to
 * artifact (uploadStep): the create carries them while the page is blank; a
 * page already stored gets them attached, including any that finished
 * while the create was on its way. Once the artifact has them all, the list
 * clears, and the artifact's own list of attached files shows them. (A
 * document never comes here: it takes files in its text.) Removing a file
 * takes it out of the create too (filesForCreate).
 * Leaving while files upload asks first. Uploads that never reached an
 * artifact are deleted when the page goes (uploadsToDiscard); the cleanup
 * job is the backstop.
 */
export function useBlankUploads({ options, artifact, onUpdated }: BlankUploadsOptions) {
  const api = options?.api;
  const uploads = useFileUploads({ send: api?.send });
  const standingRef = useRef<CreateStanding>({ state: "none", mounted: true, attempts: 0 });
  const tracker = useMemo<CreateTracker>(() => ({
    read: () => standingRef.current,
    set: (state) => {
      standingRef.current.state = state;
      if (state === "inFlight") standingRef.current.attempts += 1;
    },
  }), []);
  /** Files handed to the create, which attaches them on the server. */
  const handedRef = useRef<{ ids: string[] }>({ ids: [] });
  /** Files whose attach is on its way or whose answer was lost. */
  const holdRef = useRef(new Set<string>());
  const uploadsRef = useRef(uploads);
  useEffect(() => { uploadsRef.current = uploads; }, [uploads]);
  const { attach, problem, clearProblem, round } = useAttach(api, uploadsRef, holdRef, onUpdated);

  const readyKey = useMemo(() => uploads.readyFiles.map((file) => file.id).join(","), [uploads.readyFiles]);
  const attachedKey = useMemo(() => artifact.files.map((file) => file.id).join(","), [artifact.files]);
  const stored = artifact.id !== BLANK_ARTIFACT_ID;

  useEffect(() => {
    if (!api) return;
    const files = uploadsRef.current.readyFiles;
    const step = uploadStep({ stored, busy: uploadsRef.current.busy, readyIds: files.map((file) => file.id), attachedIds: attachedKey === "" ? [] : attachedKey.split(","), handedIds: handedRef.current.ids });
    if (step.step === "done") {
      uploadsRef.current.reset();
      return;
    }
    if (step.step === "attach") {
      attach({ id: artifact.id, publicId: artifact.publicId }, step.ids);
      return;
    }
    // Not stored yet: the files wait on the page, and the create carries them once something is written.
    if (step.step === "create") handedRef.current.ids = [...new Set([...handedRef.current.ids, ...step.ids])];
  }, [api, stored, artifact.id, artifact.publicId, uploads.busy, readyKey, attachedKey, round, attach]);

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
  return { uploads, fileIdsForCreate, removeUpload, problem, clearProblem, tracker };
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
