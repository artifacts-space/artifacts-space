"use client";

import { useEffect, useEffectEvent } from "react";

import { useInlineComments, type InlineComments } from "@/components/inline-comments/inline-comments-context";
import { linkedCommentTarget } from "@/lib/comments/link-target-rules";

import { useLinkedComments } from "./linked-comments";

/** What a link to this artifact's comments does: wait to know more, open the list (at a comment), or open the thread at its words. */
type Arrival = { kind: "wait" } | { kind: "list"; focusId: string | null } | { kind: "text"; rootId: string; commentId: string };

const WAIT: Arrival = { kind: "wait" };

/**
 * Where a linked comment opens. Without inline comments here, in the list
 * at once. With them, once the thread has loaded and its words were looked
 * for on the page (a frame later): at its words when they are there, else
 * in the list, which also says when the comment was deleted.
 */
function arrivalAt(inline: InlineComments | null, commentId: string | null): Arrival {
  if (!commentId || !inline) return { kind: "list", focusId: commentId };
  const { state } = inline.thread;
  if (state.status === "loading") return WAIT;
  if (state.status === "error") return { kind: "list", focusId: commentId };
  if (inline.surface && !inline.settled) return WAIT;
  const target = linkedCommentTarget(state.data.comments, commentId, inline.surface ? inline.located : null);
  return target.kind === "text" ? target : { kind: "list", focusId: commentId };
}

/** One string per decision, so it is acted on once. */
function keyOf(arrival: Arrival | null): string {
  if (!arrival) return "none";
  if (arrival.kind === "text") return `text:${arrival.rootId}:${arrival.commentId}`;
  return arrival.kind === "list" ? `list:${arrival.focusId ?? ""}` : "wait";
}

/**
 * Acts on a link to this artifact's comments (`?comments=1`, or
 * `?comment=<id>` from the Inbox and mention emails) once, after the
 * artifact opened: opens the thread in its card at the words when the
 * comment is an inline one whose words are on the page, else calls
 * `openList` with the comment to show (null for the whole list).
 */
export function useLinkedArrival(publicId: string, openList: (focusId: string | null) => void) {
  const { linked, commentId, consume } = useLinkedComments(publicId);
  const inline = useInlineComments();
  const here = inline?.publicId === publicId ? inline : null;
  const arrival = linked ? arrivalAt(here, commentId) : null;
  const key = keyOf(arrival);
  const act = useEffectEvent(() => {
    if (!arrival || arrival.kind === "wait") return;
    consume();
    if (arrival.kind === "text" && here?.reveal(arrival.rootId, arrival.commentId)) return;
    openList(arrival.kind === "text" ? arrival.commentId : arrival.focusId);
  });
  useEffect(() => { act(); }, [key]);
}
