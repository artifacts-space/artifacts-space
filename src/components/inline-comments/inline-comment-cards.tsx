"use client";

import { IconX } from "@tabler/icons-react";
import { useMemo, useState, type ReactNode } from "react";

import { CommentComposer } from "@/components/comments/comment-composer";
import { CommentItem, type CommentHandlers } from "@/components/comments/comment-item";
import { groupThread, MentionNotices, type ThreadGroup } from "@/components/comments/comment-thread";
import { MentionablesProvider } from "@/components/comments/mentionables-context";
import type { WriteOutcome } from "@/components/comments/use-comment-thread";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import type { MentionOutcome } from "@/lib/comments/delivery";
import type { ThreadAgentView } from "@/lib/comments/mutes";

import { useInlineComments, type InlineComments } from "./inline-comments-context";
import { DRAFT_KEY } from "./use-located-anchors";

/** Where a card goes when its words left the page while it was open: near the top of the window. */
function fallbackBox(): DOMRect {
  return new DOMRect(window.innerWidth / 2, 96, 0, 0);
}

interface CardProps {
  inline: InlineComments;
  /** Whose words the card sits at: a comment id, or the draft. */
  anchorKey: string;
  title: string;
  /** A new comment takes the keyboard; an open thread leaves it in the text, so typing there goes on. */
  takesFocus: boolean;
  children: ReactNode;
}

/** A card at a comment's words: it follows them as the page scrolls, and closes on Escape or a click elsewhere. */
function CardAtText({ inline, anchorKey, title, takesFocus, children }: CardProps) {
  const { boxOf, close } = inline;
  const anchor = useMemo(() => ({ getBoundingClientRect: () => boxOf(anchorKey) ?? fallbackBox() }), [boxOf, anchorKey]);
  return (
    <Popover open onOpenChange={(open) => { if (!open) close(); }}>
      <PopoverContent
        anchor={anchor}
        side="bottom"
        align="start"
        sideOffset={8}
        initialFocus={takesFocus}
        finalFocus={false}
        data-slot="inline-comment-card"
        className="w-[min(26rem,calc(100vw-1.5rem))] space-y-2 p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <PopoverTitle className="text-muted-foreground">{title}</PopoverTitle>
          <Button variant="ghost" size="icon-sm" aria-label="Close" className="-my-1 -mr-1 text-muted-foreground" onClick={close}><IconX /></Button>
        </div>
        <MentionablesProvider publicId={inline.publicId}>{children}</MentionablesProvider>
      </PopoverContent>
    </Popover>
  );
}

/** The new comment on the selected words. Posting it puts it in the thread and highlights the words. */
function DraftCard({ inline }: { inline: InlineComments }) {
  const { draft, thread, close } = inline;
  if (!draft) return null;
  const anchor = draft.anchor;
  return (
    <CardAtText inline={inline} anchorKey={DRAFT_KEY} title="Comment on this text" takesFocus>
      <CommentComposer
        label="Write a comment"
        placeholder="Write a comment"
        submitLabel="Comment"
        autoFocus
        onCancel={close}
        onSubmit={async (body) => {
          const outcome = await thread.post(body, null, anchor);
          if (outcome.ok) close();
          return outcome;
        }}
      />
    </CardAtText>
  );
}

/** One thread at its words: the comment, its replies, Resolve, and a reply box. */
function ThreadCard({ inline, group, agents }: { inline: InlineComments; group: ThreadGroup; agents: ReadonlyMap<string, ThreadAgentView> }) {
  const { thread, close } = inline;
  const { root, replies } = group;
  const [replying, setReplying] = useState(0);
  const [notices, setNotices] = useState<MentionOutcome | null>(null);
  const agentFor = (authorId: string | undefined) => (authorId ? agents.get(authorId) : undefined);

  function noted(outcome: WriteOutcome) {
    if (outcome.ok) setNotices(outcome.mentions);
    return outcome;
  }

  const handlers: CommentHandlers = {
    // Replies always go to this thread; Reply puts the cursor in the box below.
    onReply: () => { setReplying((count) => count + 1); },
    onEdit: async (commentId, body) => noted(await thread.edit(commentId, body)),
    onDelete: thread.remove,
    onMute: thread.setMute,
    onResolve: async (commentId, resolved) => {
      const outcome = await thread.resolve(commentId, resolved);
      // A resolved thread leaves the text; it stays in the Comments list under Resolved.
      if (outcome.ok && resolved) close();
      return outcome;
    },
  };

  return (
    <CardAtText inline={inline} anchorKey={root.id} title={replies.length === 0 ? "Comment" : `Comment and ${String(replies.length)} ${replies.length === 1 ? "reply" : "replies"}`} takesFocus={false}>
      <div className="max-h-[min(50dvh,24rem)] divide-y overflow-y-auto overscroll-contain">
        {[root, ...replies].map((item) => (
          <CommentItem key={item.id} comment={item} agent={agentFor(item.author?.kind === "agent" ? item.author.userId : undefined)} handlers={handlers} reply={item.id !== root.id} showAnchor={false} />
        ))}
      </div>
      <CommentComposer key={replying} label="Write a reply" placeholder="Reply" submitLabel="Reply" autoFocus={replying > 0} onSubmit={async (body) => noted(await thread.post(body, root.id))} />
      <MentionNotices outcome={notices} />
    </CardAtText>
  );
}

/**
 * The card at the text for this artifact's inline comments: the new comment
 * being written, or the open thread. Nothing while neither is open, or once
 * the open thread was resolved or deleted.
 */
export function InlineCommentCards() {
  const inline = useInlineComments();
  const comments = inline?.thread.state.status === "ready" ? inline.thread.state.data : null;
  const activeId = inline?.activeId ?? null;
  const active = useMemo(() => {
    if (!activeId || !comments) return null;
    return groupThread(comments.comments).find((group) => group.root.id === activeId) ?? null;
  }, [activeId, comments]);
  const agents = useMemo(() => new Map((comments?.agents ?? []).map((agent) => [agent.userId, agent])), [comments]);
  if (!inline) return null;
  if (inline.draft) return <DraftCard inline={inline} />;
  if (!active || active.root.deleted || active.root.resolved) return null;
  return <ThreadCard key={active.root.id} inline={inline} group={active} agents={agents} />;
}
