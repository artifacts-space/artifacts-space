"use client";

import { createContext, use } from "react";

import type { CommentThreadControl } from "@/components/comments/use-comment-thread";
import type { CommentAnchor } from "@/lib/comments/anchor-rules";

/** A new inline comment being written: the words it is on, and where they were on screen when it started. */
export interface InlineDraft {
  anchor: CommentAnchor;
  /** The selection's box, until the words are found on the page again. */
  box: DOMRect;
}

/**
 * Inline comments for one artifact: the thread, which comments' words are on
 * the page, and the thread or new comment open at the text.
 */
export interface InlineComments {
  publicId: string;
  thread: CommentThreadControl;
  /** False until the page's text was read once: before that, nothing is known to be missing. */
  ready: boolean;
  /** Ids of open inline comments whose words are on the page. */
  located: ReadonlySet<string>;
  /** The thread open at its words, by its top-level comment. */
  activeId: string | null;
  draft: InlineDraft | null;
  /** Opens a thread at its words. */
  open: (commentId: string) => void;
  /** Scrolls to a thread's words and opens it there. False when the words are not on the page. */
  reveal: (commentId: string) => boolean;
  /** Closes the open thread or the new comment. */
  close: () => void;
  /** Starts a comment on a stretch of the page, or on the current selection. False when it holds no words of this artifact. */
  startComment: (range?: Range) => boolean;
  /** The element whose text the comments are on, once the page has it. */
  surface: HTMLElement | null;
  /** The box on screen of a thread's words (`id`), or of the new comment's (`"draft"`). */
  boxOf: (key: string) => DOMRect | null;
  /** Ids of the inline comments whose words are at a point on screen, shortest stretch first. */
  commentsAt: (x: number, y: number) => string[];
  /** Names the element whose text the comments are on; returns how to take it away again. */
  attachSurface: (element: HTMLElement) => () => void;
}

export const InlineCommentsContext = createContext<InlineComments | null>(null);

/** Inline comments for the artifact around this component, or null where there are none (other formats, no access to comments). */
export function useInlineComments(): InlineComments | null {
  return use(InlineCommentsContext);
}

/*
 * The block menu's Comment runs as an editor command, outside React. It
 * reaches the artifact's inline comments through this registry: one starter
 * per artifact on the page.
 */
const starters = new Map<string, (range: Range) => boolean>();

/** Registers how to start an inline comment on an artifact; returns how to take it away again. */
export function registerInlineCommentStarter(publicId: string, start: (range: Range) => boolean): () => void {
  starters.set(publicId, start);
  return () => {
    if (starters.get(publicId) === start) starters.delete(publicId);
  };
}

/** Starts an inline comment on a stretch of an artifact's page. False when the artifact has no inline comments here, or the stretch holds no words. */
export function startInlineComment(publicId: string, range: Range): boolean {
  return starters.get(publicId)?.(range) ?? false;
}
