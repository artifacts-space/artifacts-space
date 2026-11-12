import type { CommentRecord } from "@/db/schema";
import { attribution, type Actor } from "@/lib/agents/identity";

import type { CommentAnchor } from "./anchor-rules";
import type { ResolvedMention } from "./mentions";
import { canChangeComment, type AuthorKind } from "./rules";

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
 * Maps a comment row for a viewer. `authors` holds the actors by user id, and
 * `mentions` the mentions this comment delivered (for highlighting).
 */
export function toCommentView(record: CommentRecord, authors: ReadonlyMap<string, Actor>, viewerId: string, mentions: readonly ResolvedMention[] = []): CommentView {
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
    anchored: false,
    anchor: null,
    resolved: null,
    canResolve: false,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
