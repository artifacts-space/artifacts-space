import { threadUrl } from "@/lib/comments/mention-email";
import { textChangedCheck, type ServedAnchors } from "@/lib/comments/served-anchors";
import type { CommentAuthorView, CommentView } from "@/lib/comments/views";
import { teammatesAmong } from "@/lib/teams/teammates";

import { toMcpActor, type McpActor } from "./actors";

/*
 * A comment as agents read it, in comments_list, inbox_list, and the
 * comment write results. Its body, quote, and the text around the quote are
 * labelled untrusted, because people and other agents wrote them. The quote
 * and its surrounding text come from the comment view, which the anchor
 * gate (served-anchors.ts) already read from the text this caller is served:
 * a reader of the approved version never gets words of an unapproved one.
 */

function untrusted(text: string) {
  return { untrustedText: text };
}

/** What one comment's MCP shape needs besides the view. */
export interface McpCommentContext {
  /** The caller's teammates among the comment's people (teammatesAmong): they get names. */
  teammates: ReadonlySet<string>;
  /** Whether an inline comment's words are no longer in the text the caller is served (textChangedCheck). By default, only a withheld quote counts. */
  onTextThatChanged?: boolean;
  /** The comment's own link: it opens the artifact with this comment shown. */
  url?: string;
}

/** Every user id a list of comment views names: authors and resolvers, for teammatesAmong. */
export function commentPeopleIds(views: readonly CommentView[]): string[] {
  return views.flatMap((view) => [view.author?.userId, view.resolved?.resolver?.userId].filter((id): id is string => typeof id === "string"));
}

/** The caller's teammates among these comments' people: one query, or none when the comments name nobody. */
export async function commentTeammates(viewerId: string, views: readonly CommentView[]): Promise<ReadonlySet<string>> {
  return teammatesAmong(viewerId, commentPeopleIds(views));
}

function actorFor(author: CommentAuthorView | null | undefined, teammates: ReadonlySet<string>): McpActor | null {
  return author ? toMcpActor(author, teammates.has(author.userId)) : null;
}

/** The quote's surrounding text, when there is any: read from the served text, never the stored anchor, for readers of an approved version. */
function aroundQuote(view: CommentView) {
  if (!view.anchor) return {};
  return {
    ...(view.anchor.prefix ? { quotePrefix: untrusted(view.anchor.prefix) } : {}),
    ...(view.anchor.suffix ? { quoteSuffix: untrusted(view.anchor.suffix) } : {}),
  };
}

/** Fields that are left out while they say nothing: who it reached, when it was edited, its link. */
function optionalFields(view: CommentView, context: McpCommentContext) {
  return {
    ...(view.mentions.length > 0 ? { mentions: view.mentions.map((item) => item.handle) } : {}),
    ...(view.edited ? { updatedAt: view.updatedAt } : {}),
    ...(context.url ? { url: context.url } : {}),
  };
}

/** A comment as agents see it. */
export function toMcpComment(view: CommentView, context: McpCommentContext) {
  const onTextThatChanged = context.onTextThatChanged ?? (view.anchored && view.anchor === null);
  return {
    id: view.id,
    replyTo: view.parentId,
    author: actorFor(view.author, context.teammates),
    body: untrusted(view.body),
    quote: view.anchor ? untrusted(view.anchor.quote) : null,
    ...aroundQuote(view),
    onTextThatChanged,
    resolved: view.resolved ? { at: view.resolved.at, by: actorFor(view.resolved.resolver, context.teammates) } : null,
    deleted: view.deleted,
    edited: view.edited,
    createdAt: view.createdAt,
    ...optionalFields(view, context),
  };
}

/** One comment for a write result, with its own link. */
export async function toMcpCommentResult(view: CommentView, viewerId: string, publicId: string | null, onTextThatChanged?: boolean) {
  const teammates = await commentTeammates(viewerId, [view]);
  const url = publicId ? threadUrl(publicId, view.id) : undefined;
  return toMcpComment(view, { teammates, ...(onTextThatChanged === undefined ? {} : { onTextThatChanged }), ...(url ? { url } : {}) });
}

/**
 * Comments for an agent, each with its own link, and each told whether its words are still in the
 * content the agent is served. Pass `teammates` when the request already
 * looked them up for a larger set (the inbox).
 */
export async function toMcpComments(publicId: string, viewerId: string, views: readonly CommentView[], served?: ServedAnchors, teammates?: ReadonlySet<string>) {
  const [changed, known] = await Promise.all([textChangedCheck(publicId, viewerId, views, served), teammates ?? commentTeammates(viewerId, views)]);
  return views.map((view) => toMcpComment(view, { teammates: known, onTextThatChanged: changed(view), url: threadUrl(publicId, view.id) }));
}
