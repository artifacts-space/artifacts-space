"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { useCommentThread, type ThreadApi } from "@/components/comments/use-comment-thread";
import type { ArtifactKind } from "@/lib/artifact-types";
import { anchorAt } from "@/lib/comments/anchor-rules";
import type { CommentView } from "@/lib/comments/views";

import { indexText, spanOf } from "./dom-text";
import { InlineCommentCards } from "./inline-comment-cards";
import { InlineCommentsContext, registerInlineCommentStarter, type InlineComments, type InlineDraft } from "./inline-comments-context";
import { DRAFT_KEY, useLocatedAnchors, type AnchorToLocate } from "./use-located-anchors";

interface InlineCommentsProviderProps {
  publicId: string;
  /** The artifact's format: only a Markdown artifact's words take comments. */
  kind: ArtifactKind;
  /** The viewer may read and write this artifact's comments. Without it there are no inline comments, and nothing loads. */
  canComment: boolean;
  /** False for a new artifact nothing was saved to yet: there is nothing to comment on. */
  stored?: boolean | undefined;
  /** The thread's server calls; a fixture page hands in its own. */
  api?: ThreadApi | undefined;
  children: ReactNode;
}

/** The open inline comments to find on the page: top-level, not deleted, not resolved, with words this viewer may read. */
function openAnchors(comments: readonly CommentView[]): AnchorToLocate[] {
  const anchors: AnchorToLocate[] = [];
  for (const comment of comments) {
    if (comment.anchor && !comment.deleted && !comment.resolved && !comment.parentId) anchors.push({ key: comment.id, anchor: comment.anchor });
  }
  return anchors;
}

/** The selection, when it is a stretch of text (not just a cursor). */
function selectedRange(): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  return selection.getRangeAt(0);
}

/** A new comment on a stretch of the surface: its words and their box. Null when the stretch is outside it or holds no words. */
function draftFor(surface: HTMLElement, range: Range): InlineDraft | null {
  const root = surface.querySelector("[data-comment-root]") ?? surface;
  if (!root.contains(range.commonAncestorContainer)) return null;
  const index = indexText(root);
  const span = spanOf(index, range);
  const anchor = span ? anchorAt(index.text, span) : null;
  return anchor ? { anchor, box: range.getBoundingClientRect() } : null;
}

/**
 * Inline comments for the artifact inside: loads its thread once (without
 * marking it read), highlights the words each open inline comment is on
 * (InlineCommentSurface marks where the text is), and shows a thread or a
 * new comment in a card at its words. The Comments list inside reads the
 * same thread. For other formats, a new artifact not saved yet, or a viewer
 * who may not comment, it gives its children no inline comments.
 */
export function InlineCommentsProvider({ publicId, kind, canComment, stored = true, api, children }: InlineCommentsProviderProps) {
  const enabled = canComment && stored && kind === "markdown";
  const thread = useCommentThread(publicId, { api, markAsRead: false, enabled });
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InlineDraft | null>(null);

  const comments = thread.state.status === "ready" ? thread.state.data.comments : null;
  const anchors = useMemo(() => {
    const open = comments ? openAnchors(comments) : [];
    return draft ? [...open, { key: DRAFT_KEY, anchor: draft.anchor }] : open;
  }, [comments, draft]);
  const activeKey = draft ? DRAFT_KEY : activeId;
  const { located, ready, boxOf, scrollTo, keysAt } = useLocatedAnchors(enabled ? surface : null, anchors, activeKey);

  const startComment = useCallback(
    (range?: Range) => {
      const next = surface ? draftFor(surface, range ?? selectedRange() ?? document.createRange()) : null;
      if (!next) return false;
      setActiveId(null);
      setDraft(next);
      return true;
    },
    [surface],
  );

  /** The read view and the editor swap in place: the one that leaves only takes itself away. */
  const attachSurface = useCallback((element: HTMLElement) => {
    setSurface(element);
    return () => { setSurface((current) => (current === element ? null : current)); };
  }, []);

  useEffect(() => (enabled ? registerInlineCommentStarter(publicId, startComment) : undefined), [enabled, publicId, startComment]);

  const value = useMemo<InlineComments>(
    () => ({
      publicId,
      thread,
      ready,
      located,
      activeId,
      draft,
      open: (commentId) => {
        setDraft(null);
        setActiveId(commentId);
        void thread.markRead();
      },
      reveal: (commentId) => {
        if (!scrollTo(commentId)) return false;
        setDraft(null);
        setActiveId(commentId);
        void thread.markRead();
        return true;
      },
      close: () => {
        setDraft(null);
        setActiveId(null);
      },
      startComment,
      surface,
      boxOf: (key) => boxOf(key) ?? (key === DRAFT_KEY ? (draft?.box ?? null) : null),
      commentsAt: keysAt,
      attachSurface,
    }),
    [publicId, thread, ready, located, activeId, draft, startComment, surface, boxOf, scrollTo, keysAt, attachSurface],
  );

  // One tree shape on or off: turning inline comments on (a new artifact's first save) must not remount the editor inside.
  return (
    <InlineCommentsContext value={enabled ? value : null}>
      {children}
      {enabled ? <InlineCommentCards /> : null}
    </InlineCommentsContext>
  );
}
