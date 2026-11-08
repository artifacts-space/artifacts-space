"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createCommentAction,
  deleteCommentAction,
  loadThreadAction,
  setThreadMuteAction,
  updateCommentAction,
  type ThreadData,
} from "@/app/(workspace)/threads/actions";
import { announceNotificationsChanged } from "@/components/notifications/notification-events";
import type { ActionResult } from "@/lib/artifact-types";
import type { MentionOutcome } from "@/lib/comments/delivery";

export type ThreadState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: ThreadData };

const offline = "Something went wrong. Check your connection and try again.";

/** The outcome of a write, for the composer: an error, or the mention notices. */
export type WriteOutcome = { ok: true; mentions: MentionOutcome | null } | { ok: false; error: string };

async function settle<T>(action: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await action();
  } catch {
    return { success: false, error: offline };
  }
}

/**
 * Loads an artifact's comment thread once, and reloads it after each change
 * the viewer makes. There is no background refresh. Loading marks the
 * viewer's notifications on it read, so the bell is told to catch up.
 */
export function useCommentThread(publicId: string) {
  const [state, setState] = useState<ThreadState>({ status: "loading" });

  const reload = useCallback(async () => {
    const result = await settle(() => loadThreadAction(publicId));
    setState(result.success ? { status: "ready", data: result.data } : { status: "error", error: result.error });
  }, [publicId]);

  useEffect(() => {
    let active = true;
    void settle(() => loadThreadAction(publicId)).then((result) => {
      if (!active) return;
      setState(result.success ? { status: "ready", data: result.data } : { status: "error", error: result.error });
      // Loading the thread marked its notifications read; the bell catches up.
      if (result.success) announceNotificationsChanged();
    });
    return () => {
      active = false;
    };
  }, [publicId]);

  const write = useCallback(
    async (action: () => Promise<ActionResult<{ mentions: MentionOutcome } | null>>): Promise<WriteOutcome> => {
      const result = await settle(action);
      if (!result.success) return { ok: false, error: result.error };
      await reload();
      return { ok: true, mentions: result.data?.mentions ?? null };
    },
    [reload],
  );

  return {
    state,
    post: (body: string, parentId: string | null) => write(() => createCommentAction(publicId, body, parentId)),
    edit: (commentId: string, body: string) => write(() => updateCommentAction(commentId, body)),
    remove: (commentId: string) => write(() => deleteCommentAction(commentId)),
    setMute: (handle: string, muted: boolean) => write(() => setThreadMuteAction(publicId, handle, muted)),
  };
}
