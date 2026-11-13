import type { CommentView } from "./views";

/**
 * Where a link to one comment (the Inbox, a mention email) opens it. Pure and
 * client-safe; the thread the viewer is allowed to load is the only input, so
 * a link never shows more than the thread does.
 */

/** The fields of a comment the rule reads. */
export type LinkedComment = Pick<CommentView, "id" | "parentId" | "deleted" | "resolved" | "anchor">;

/**
 * - `text`: the thread opens in its card at the words, with the comment (the
 *   thread's first comment or a reply) in view.
 * - `list`: the Comments list opens with the comment in view.
 * - `deleted`: the comment is gone; the Comments list opens and says so.
 */
export type LinkedCommentTarget =
  | { kind: "text"; rootId: string; commentId: string }
  | { kind: "list"; commentId: string }
  | { kind: "deleted" };

/**
 * Where the linked comment opens. `located` holds the ids of open inline
 * comments whose words are on the page, or is null where the page shows no
 * inline comments. A thread that is resolved, or whose words changed, opens
 * in the list, as does any comment on the whole artifact; a reply follows
 * its thread.
 */
export function linkedCommentTarget(comments: readonly LinkedComment[], commentId: string, located: ReadonlySet<string> | null): LinkedCommentTarget {
  const linked = comments.find((item) => item.id === commentId);
  if (!linked || linked.deleted) return { kind: "deleted" };
  const root = linked.parentId === null ? linked : comments.find((item) => item.id === linked.parentId);
  const atText = root !== undefined && !root.deleted && root.resolved === null && root.anchor !== null && located?.has(root.id) === true;
  return atText ? { kind: "text", rootId: root.id, commentId } : { kind: "list", commentId };
}
