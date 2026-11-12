import type { CommentRecord } from "@/db/schema";
import { attribution, type Actor } from "@/lib/agents/identity";

import { hideAnchors, storedAnchorOf, type AnchorGate } from "./anchor-privacy-rules";
import type { CommentAnchor } from "./anchor-rules";
import type { ResolvedMention } from "./mentions";
import { canChangeComment, canResolveComment, type AuthorKind } from "./rules";

/** Who wrote a comment, as the thread shows it. */
export interface CommentAuthorView {
  userId: string;
  handle: string | null;
  name: string;
  kind: AuthorKind;
  /** For agents: the person who added the agent. */
  ownerName: string | null;
  /** "@claude-code for Charles", "@charles", or a name. */
  label: string;
}

/** One comment in a thread. Deleted comments keep their place with an empty body. */
export interface CommentView {
  id: string;
  parentId: string | null;
  /** Markdown, written by a person or an agent. Untrusted. Empty when deleted. */
  body: string;
  deleted: boolean;
  edited: boolean;
  /** Null when the author's account is gone. */
  author: CommentAuthorView | null;
  /** Handles in the body that reached a real person or agent. Empty when deleted. */
  mentions: ResolvedMention[];
  /** The viewer wrote it and may edit or delete it. */
  canChange: boolean;
  /** True for a top-level comment that was made on words in the artifact (an inline comment), even when `anchor` is withheld. */
  anchored: boolean;
  /**
   * The words an inline comment was made on, with the text around them. Null
   * for a comment on the whole artifact, for replies, for deleted comments,
   * and when this viewer may not read the words (they are not in the version
   * of the artifact the viewer is served).
   */
  anchor: CommentAnchor | null;
  /** Set on a top-level comment whose thread was resolved: when, and by whom (a label such as "@charles", null when they are gone). */
  resolved: { at: string; by: string | null } | null;
  /** The viewer may resolve or reopen this thread. Always false for replies and deleted comments. */
  canResolve: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The author view of an actor. */
export function toAuthorView(actor: Actor): CommentAuthorView {
  const ownerName = actor.kind === "agent" ? actor.ownerName : null;
  return {
    userId: actor.userId,
    handle: actor.handle,
    name: actor.name,
    kind: actor.kind,
    ownerName,
    label: attribution({ kind: actor.kind, handle: actor.handle, name: actor.name, ownerName }),
  };
}

/**
 * What a view needs to know about its viewer beyond their id. Every caller
 * that returns comments passes it; without it no anchor is shown and nothing
 * can be resolved, so a forgotten caller never leaks a quote.
 */
export interface CommentViewContext {
  /** The viewer's kind, or null when unknown. Set only after the thread's access check passed. */
  viewerKind: AuthorKind | null;
  /** The anchor this viewer may read for a stored one (anchor-privacy-rules.ts). */
  anchorFor: AnchorGate;
}

const closedContext: CommentViewContext = { viewerKind: null, anchorFor: hideAnchors };

/** The resolved state of a live top-level comment, credited like an author. */
function resolvedView(record: CommentRecord, actors: ReadonlyMap<string, Actor>): CommentView["resolved"] {
  if (record.parentId !== null || record.deletedAt !== null || !record.resolvedAt) return null;
  const resolver = record.resolvedBy ? actors.get(record.resolvedBy) : undefined;
  return { at: record.resolvedAt.toISOString(), by: resolver ? toAuthorView(resolver).label : null };
}

/** The anchor fields: only a live top-level comment carries one, and only what the viewer may read is shown. */
function anchorView(record: CommentRecord, context: CommentViewContext): Pick<CommentView, "anchored" | "anchor"> {
  const stored = record.parentId === null && record.deletedAt === null ? storedAnchorOf(record) : null;
  return { anchored: stored !== null, anchor: stored ? context.anchorFor(stored) : null };
}

/**
 * Maps a comment row for a viewer. `authors` holds the actors by user id
 * (authors and resolvers), `mentions` the mentions this comment delivered
 * (for highlighting), and `context` the viewer's kind and anchor gate.
 */
export function toCommentView(record: CommentRecord, authors: ReadonlyMap<string, Actor>, viewerId: string, mentions: readonly ResolvedMention[] = [], context: CommentViewContext = closedContext): CommentView {
  const actor = record.authorId ? authors.get(record.authorId) : undefined;
  const deleted = record.deletedAt !== null;
  return {
    id: record.id,
    parentId: record.parentId,
    body: deleted ? "" : record.body,
    deleted,
    // Both times come from the database clock: equal at insert, later after an edit.
    edited: !deleted && record.updatedAt.getTime() > record.createdAt.getTime(),
    author: actor ? toAuthorView(actor) : null,
    mentions: deleted ? [] : [...mentions],
    canChange: canChangeComment(record, viewerId),
    ...anchorView(record, context),
    resolved: resolvedView(record, authors),
    canResolve: canResolveComment({ viewerKind: context.viewerKind, canUseThread: true, comment: record }),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Every user id a list of comment rows names: authors and resolvers, for loadActors. */
export function actorIdsOf(records: readonly CommentRecord[]): string[] {
  return [...new Set(records.flatMap((record) => [record.authorId, record.resolvedBy].filter((id): id is string => id !== null)))];
}
