"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { PageUploadTicket } from "@/app/(workspace)/app/page-file-actions";
import { maxUploadsAtOnce } from "@/components/editor/rich/media-upload-rules";
import type { ArtifactDto } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";
import { batchStep, inChunks, publishedWords, reviewBatch, type BatchReview, type BatchStep, type BatchUploadState } from "@/lib/page-files/batch-rules";
import { pageBatchLimits, type HeldPageFile } from "@/lib/page-files/publish-rules";

import type { PageFilesApi } from "./page-files-api";
import { uploadCancelled } from "./put-file";

/** Where one file of the set is: not asked for yet, asked for, waiting for a free place, sending, being checked, ready, or failed. */
export type RowStage = "new" | "starting" | "queued" | "sending" | "checking" | "ready" | "failed";

/** One page file of a person's set, from the drop to the publish. */
export interface PageRow {
  key: string;
  file: File;
  /** The path it takes: from the drop, or as the person typed it. */
  path: string;
  stage: RowStage;
  progress: number;
  /** Why its upload failed, in the server's words. */
  error: string | null;
  /** Its upload, once the server started one. */
  fileId: string | null;
  /** True when the person chose this file to replace a held one (Replace on that file's row). */
  chosen: boolean;
}

interface BatchState {
  rows: PageRow[];
  /** The person said to go ahead with replacing held files. */
  confirmed: boolean;
  publishing: boolean;
  /** Why the last publish was refused, in the server's words. */
  publishError: string | null;
}

const emptyBatch: BatchState = { rows: [], confirmed: false, publishing: false, publishError: null };

let nextKey = 0;

/** A new row for a file at a path. */
export function newPageRow(file: File, path: string, chosen = false): PageRow {
  nextKey += 1;
  return { key: `page-${String(nextKey)}`, file, path, stage: "new", progress: 0, error: null, fileId: null, chosen };
}

function uploadState(stage: RowStage): BatchUploadState {
  if (stage === "ready" || stage === "failed") return stage;
  return stage === "new" || stage === "starting" || stage === "queued" ? "waiting" : "uploading";
}

/** True while any file of the set is on its way, or the set is being published: the tab asks before it closes. */
function isBusy(state: BatchState): boolean {
  return state.publishing || state.rows.some((row) => row.stage !== "ready" && row.stage !== "failed" && row.stage !== "new");
}

interface Options {
  artifactId: string;
  held: readonly HeldPageFile[];
  api: PageFilesApi;
  onUpdated: (artifact: ArtifactDto) => void;
}

/**
 * A person's set of page files on its way into an HTML artifact: each
 * file's path, upload, and progress, and the one publish that adds them.
 * Files whose path is fine upload at once, a few at a time
 * (maxUploadsAtOnce), from requests of at most pageBatchLimits'
 * maxUploadsPerRequest; a file whose path needs fixing waits for the fix.
 * When every file is ready the set is published in one call, by itself, or
 * after the person says so when it replaces held files (batchStep).
 * Cancel aborts every request and publishes nothing.
 */
export function usePageBatch({ artifactId, held, api, onUpdated }: Options) {
  const [state, setState] = useState<BatchState>(emptyBatch);
  const stateRef = useRef(state);
  const controllers = useRef(new Map<string, AbortController>());
  const tickets = useRef(new Map<string, PageUploadTicket>());
  const running = useRef(0);
  const queue = useRef<string[]>([]);
  const context = useRef({ artifactId, api, onUpdated });
  useEffect(() => { context.current = { artifactId, api, onUpdated }; }, [artifactId, api, onUpdated]);

  const commit = useCallback((change: (current: BatchState) => BatchState) => {
    stateRef.current = change(stateRef.current);
    setState(stateRef.current);
  }, []);
  const patchRow = useCallback((key: string, change: Partial<PageRow>) => {
    commit((current) => ({ ...current, rows: current.rows.map((row) => (row.key === key ? { ...row, ...change } : row)) }));
  }, [commit]);
  const rowOf = (key: string) => stateRef.current.rows.find((row) => row.key === key);

  const review = useMemo<BatchReview>(() => reviewBatch(state.rows.map(({ key, path, file }) => ({ key, path, size: file.size })), held), [state.rows, held]);

  /** Sends one queued file, then has the server check it. A file left out or cancelled meanwhile is let go quietly. */
  const send = useCallback(async (key: string) => {
    const row = rowOf(key);
    const ticket = tickets.current.get(key);
    if (!row || !ticket) return;
    const stop = new AbortController();
    controllers.current.set(key, stop);
    patchRow(key, { stage: "sending", progress: 0 });
    try {
      await context.current.api.put(ticket, row.file, (progress) => { patchRow(key, { progress }); }, stop.signal);
      patchRow(key, { stage: "checking", progress: 100 });
      const checked: { success: true; data: FileDto } | { success: false; error: string } = await context.current.api.finalize(ticket.fileId);
      // Left out or cancelled while it was checked: the upload is not needed.
      if (!rowOf(key)) { void context.current.api.discard(ticket.fileId).catch(() => undefined); return; }
      // A file that failed its check was removed by the server: Try again starts a new upload.
      patchRow(key, checked.success ? { stage: "ready" } : { stage: "failed", error: checked.error, fileId: null });
    } catch (error) {
      if (!rowOf(key) || (error instanceof Error && error.message === uploadCancelled)) return;
      void context.current.api.discard(ticket.fileId).catch(() => undefined);
      patchRow(key, { stage: "failed", error: error instanceof Error ? error.message : "The upload failed. Try again.", fileId: null });
    } finally {
      controllers.current.delete(key);
      tickets.current.delete(key);
    }
  }, [patchRow]);

  // Sends queued files, a few at a time; each one that ends makes room for the next.
  const drainRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    drainRef.current = () => {
      while (running.current < maxUploadsAtOnce) {
        const key = queue.current.shift();
        if (key === undefined) return;
        running.current += 1;
        void send(key).finally(() => { running.current -= 1; drainRef.current(); });
      }
    };
  }, [send]);

  /** Takes the server's answer for one row: queues it to send, says why it could not start, or lets an unneeded upload go. */
  const takeTicket = useCallback((row: PageRow, answer: { success: true; data: PageUploadTicket[] } | { success: false; error: string }) => {
    const ticket = answer.success ? answer.data.find((entry) => entry.path === row.path) : undefined;
    const now = rowOf(row.key);
    // Left out, or given another path, while the request was on its way: its upload is not needed.
    if (now?.stage !== "starting" || now.path !== row.path) {
      if (ticket) void context.current.api.discard(ticket.fileId).catch(() => undefined);
      return;
    }
    if (!ticket) {
      patchRow(row.key, { stage: "failed", error: answer.success ? "The upload could not start. Try again." : answer.error });
      return;
    }
    tickets.current.set(row.key, ticket);
    patchRow(row.key, { stage: "queued", fileId: ticket.fileId });
    queue.current.push(row.key);
  }, [patchRow]);

  /** Asks the server to start the uploads of these rows, in as few requests as the cap allows, and queues them to send. */
  const start = useCallback(async (keys: readonly string[]) => {
    commit((current) => ({ ...current, rows: current.rows.map((row) => (keys.includes(row.key) ? { ...row, stage: "starting" } : row)) }));
    for (const chunk of inChunks(keys, pageBatchLimits.maxUploadsPerRequest)) {
      const rows = chunk.flatMap((key) => rowOf(key) ?? []);
      const answer = await context.current.api.request({ artifactId: context.current.artifactId, files: rows.map((row) => ({ path: row.path, size: row.file.size })) })
        .catch(() => ({ success: false as const, error: "The uploads could not start. Check your connection and try again." }));
      for (const row of rows) takeTicket(row, answer);
      drainRef.current();
    }
  }, [commit, takeTicket]);

  const publish = useCallback(async () => {
    const ready = stateRef.current.rows.filter((row) => row.stage === "ready" && row.fileId !== null);
    const uploadIds = ready.flatMap((row) => row.fileId ?? []);
    if (uploadIds.length === 0) return;
    commit((current) => ({ ...current, publishing: true, publishError: null }));
    const result = await context.current.api.publish({ artifactId: context.current.artifactId, uploadIds, remove: [] })
      .catch(() => ({ success: false as const, error: "The files could not be added. Check your connection and try again." }));
    if (!result.success) { commit((current) => ({ ...current, publishing: false, publishError: result.error })); return; }
    const published = new Set(ready.map((row) => row.key));
    commit((current) => ({ rows: current.rows.filter((row) => !published.has(row.key)), confirmed: false, publishing: false, publishError: null }));
    context.current.onUpdated(result.data.artifact);
    toast.success(publishedWords(result.data));
  }, [commit]);

  const chosen = new Set(state.rows.filter((row) => row.chosen).map((row) => row.key));
  const step: BatchStep = batchStep(state.rows.map((row) => uploadState(row.stage)), review, state.confirmed || [...review.replaces.keys()].every((key) => chosen.has(key)));

  // Starts what can start: rows whose path is fine, once the set fits the page. Runs after each change, never on a timer.
  useEffect(() => {
    if (review.setProblem || state.publishing) return;
    const startable = state.rows.filter((row) => row.stage === "new" && !review.pathProblems.has(row.key)).map((row) => row.key);
    if (startable.length > 0) void start(startable);
  }, [review, state.publishing, state.rows, start]);

  // A set that is ready publishes by itself; one that was refused waits for Try again.
  useEffect(() => {
    if (step === "publish" && !state.publishing && state.publishError === null) void publish();
  }, [step, state.publishing, state.publishError, publish]);

  /** Lets one file go: its request stops and its upload is deleted. */
  const leaveOut = useCallback((key: string) => {
    const row = rowOf(key);
    if (!row) return;
    controllers.current.get(key)?.abort();
    queue.current = queue.current.filter((queued) => queued !== key);
    if (row.fileId) void context.current.api.discard(row.fileId).catch(() => undefined);
    commit((current) => ({ ...current, rows: current.rows.filter((entry) => entry.key !== key), publishError: null }));
  }, [commit]);

  /** Gives a file a new path. An upload started for the old path is let go: a page file's path is fixed when its upload starts. */
  const setPath = useCallback((key: string, path: string) => {
    const row = rowOf(key);
    if (!row || row.path === path) return;
    controllers.current.get(key)?.abort();
    queue.current = queue.current.filter((queued) => queued !== key);
    if (row.fileId) void context.current.api.discard(row.fileId).catch(() => undefined);
    patchRow(key, { path, stage: "new", progress: 0, error: null, fileId: null });
    commit((current) => ({ ...current, publishError: null }));
  }, [commit, patchRow]);

  const add = useCallback((rows: readonly PageRow[]) => {
    if (rows.length > 0) commit((current) => ({ ...current, rows: [...current.rows, ...rows], publishError: null }));
  }, [commit]);

  /** Stops every request and deletes every upload of the set. Nothing is published. */
  const cancel = useCallback(() => {
    for (const stop of controllers.current.values()) stop.abort();
    queue.current = [];
    for (const row of stateRef.current.rows) if (row.fileId) void context.current.api.discard(row.fileId).catch(() => undefined);
    commit(() => emptyBatch);
  }, [commit]);

  return {
    rows: state.rows,
    review,
    step,
    publishing: state.publishing,
    publishError: state.publishError,
    busy: isBusy(state),
    add,
    leaveOut,
    setPath,
    cancel,
    retry: (key: string) => { patchRow(key, { stage: "new", error: null, progress: 0, fileId: null }); },
    confirm: () => { commit((current) => ({ ...current, confirmed: true })); },
    publishAgain: () => { commit((current) => ({ ...current, publishError: null })); },
  };
}

export type PageBatch = ReturnType<typeof usePageBatch>;
