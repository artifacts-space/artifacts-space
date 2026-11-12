"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createCommentAction,
  deleteCommentAction,
  loadThreadAction,
  markThreadReadAction,
  resolveCommentAction,
  setThreadMuteAction,
  updateCommentAction,
  type ThreadData,
} from "@/app/(workspace)/threads/actions";
import { announceNotificationsChanged } from "@/components/notifications/notification-events";
import type { ActionResult } from "@/lib/artifact-types";
import type { CommentAnchor } from "@/lib/comments/anchor-rules";
import type { MentionOutcome } from "@/lib/comments/delivery";

export type ThreadState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: ThreadData };

const offline = "Something went wrong. Check your connection and try again.";

/** The outcome of a write, for the composer: an error, or the mention notices. */
export type WriteOutcome = { ok: true; mentions: MentionOutcome | null } | { ok: false; error: string };

/**
 * The server calls a thread makes. The app uses the thread actions; a
 * fixture page hands in its own, so the thread works without a database.
 */
export interface ThreadApi {
  load: (publicId: string, markAsRead: boolean) => Promise<ActionResult<ThreadData>>;
  create: (publicId: string, body: string, parentId: string | null, anchor: CommentAnchor | null) => Promise<ActionResult<{ mentions: MentionOutcome }>>;
  update: (commentId: string, body: string) => Promise<ActionResult<{ mentions: MentionOutcome }>>;
  remove: (commentId: string) => Promise<ActionResult<null>>;
  resolve: (commentId: string, resolved: boolean) => Promise<ActionResult<null>>;
  setMute: (publicId: string, handle: string, muted: boolean) => Promise<ActionResult<null>>;
  markRead: (publicId: string) => Promise<ActionResult<null>>;
}

/** The thread actions on the server. */
export const serverThreadApi: ThreadApi = {
  load: loadThreadAction,
  create: createCommentAction,
  update: updateCommentAction,
  remove: deleteCommentAction,
  resolve: resolveCommentAction,
  setMute: setThreadMuteAction,
  markRead: markThreadReadAction,
};

async function settle<T>(action: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await action();
  } catch {
    return { success: false, error: offline };
  }
}

interface ThreadOptions {
  api?: ThreadApi | undefined;
  /**
   * Loading marks the viewer's notifications on the thread read (default).
   * False loads it for the highlights in the artifact's text without marking
   * anything; `markRead` does that once the viewer opens a thread.
   */
  markAsRead?: boolean | undefined;
  /** False loads nothing: the viewer may not use this artifact's comments. */
  enabled?: boolean | undefined;
}

/**
 * Loads an artifact's comment thread once, and reloads it after each change
 * the viewer makes. There is no background refresh. Loading marks the
 * viewer's notifications on it read (unless `markAsRead` is false), so the
 * bell is told to catch up.
 */
export function useCommentThread(publicId: string, { api = serverThreadApi, markAsRead = true, enabled = true }: ThreadOptions = {}) {
  const [state, setState] = useState<ThreadState>({ status: "loading" });
  /** True once the viewer's notifications were marked read for what is loaded; a reload may bring new ones. */
  const markedRead = useRef(false);

  const reload = useCallback(async () => {
    const result = await settle(() => api.load(publicId, false));
    markedRead.current = false;
    setState(result.success ? { status: "ready", data: result.data } : { status: "error", error: result.error });
  }, [api, publicId]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    markedRead.current = false;
    void settle(() => api.load(publicId, markAsRead)).then((result) => {
      if (!active) return;
      setState(result.success ? { status: "ready", data: result.data } : { status: "error", error: result.error });
      // Loading the thread marked its notifications read; the bell catches up.
      if (result.success && markAsRead) announceNotificationsChanged();
    });
    return () => {
      active = false;
    };
  }, [api, publicId, markAsRead, enabled]);

  const write = useCallback(
    async (action: () => Promise<ActionResult<{ mentions: MentionOutcome } | null>>): Promise<WriteOutcome> => {
      const result = await settle(action);
      if (!result.success) return { ok: false, error: result.error };
      await reload();
      return { ok: true, mentions: result.data?.mentions ?? null };
    },
    [reload],
  );

  /** Marks the viewer's notifications on this thread read, once per load, when they open it. A failure only leaves them unread. */
  const markRead = useCallback(async () => {
    if (markedRead.current) return;
    markedRead.current = true;
    const result = await settle(() => api.markRead(publicId));
    if (result.success) announceNotificationsChanged();
    else markedRead.current = false;
  }, [api, publicId]);

  return useMemo(
    () => ({
      state,
      reload,
      markRead,
      /** A new comment, a reply (`parentId`), or an inline comment on words in the artifact (`anchor`). */
      post: (body: string, parentId: string | null, anchor: CommentAnchor | null = null) => write(() => api.create(publicId, body, parentId, anchor)),
      edit: (commentId: string, body: string) => write(() => api.update(commentId, body)),
      remove: (commentId: string) => write(() => api.remove(commentId)),
      /** Resolves a thread by its top-level comment, or reopens it. */
      resolve: (commentId: string, resolved: boolean) => write(() => api.resolve(commentId, resolved)),
      setMute: (handle: string, muted: boolean) => write(() => api.setMute(publicId, handle, muted)),
    }),
    [api, publicId, state, reload, markRead, write],
  );
}

/** A loaded thread and the changes the viewer can make to it. */
export type CommentThreadControl = ReturnType<typeof useCommentThread>;
