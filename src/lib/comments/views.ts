import type { CommentRecord } from "@/db/schema";
import { attribution, type Actor } from "@/lib/agents/identity";

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
  /** The viewer wrote it and may edit or delete it. */
  canChange: boolean;
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

/** Maps a comment row for a viewer. `authors` holds the actors by user id. */
export function toCommentView(record: CommentRecord, authors: ReadonlyMap<string, Actor>, viewerId: string): CommentView {
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
    canChange: canChangeComment(record, viewerId),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
