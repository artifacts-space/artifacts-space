"use client";

import { IconLoader2, IconMessage } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import type { ThreadData } from "@/app/(workspace)/threads/actions";
import { Button } from "@/components/ui/button";
import type { MentionOutcome } from "@/lib/comments/delivery";
import type { ThreadAgentView } from "@/lib/comments/mutes";
import type { CommentView } from "@/lib/comments/views";
import { cn } from "@/lib/utils";

import { CommentComposer } from "./comment-composer";
import { CommentItem, type CommentHandlers } from "./comment-item";
import { useCommentThread, type WriteOutcome } from "./use-comment-thread";

/** Top-level comments, each with its replies. */
function groupThread(comments: CommentView[]) {
  const replies = new Map<string, CommentView[]>();
  const roots: CommentView[] = [];
  for (const item of comments) {
    if (!item.parentId) {
      roots.push(item);
      continue;
    }
    replies.set(item.parentId, [...(replies.get(item.parentId) ?? []), item]);
  }
  return roots.map((root) => ({ root, replies: replies.get(root.id) ?? [] }));
}

/** What happened to the mentions in the viewer's last comment. */
function MentionNotices({ outcome }: { outcome: MentionOutcome | null }) {
  if (!outcome || (outcome.refused.length === 0 && outcome.notified.length === 0)) return null;
  return (
    <div role="status" className="space-y-1 rounded-md border bg-muted/50 px-3 py-2 text-xs leading-5">
      {outcome.notified.length > 0 ? <p>Notified {outcome.notified.map((item) => `@${item.handle}`).join(", ")}.</p> : null}
      {outcome.refused.map((item) => <p key={item.handle} className="text-destructive">{item.message}</p>)}
    </div>
  );
}

function MutedAgents({ agents, onMute }: { agents: ThreadAgentView[]; onMute: CommentHandlers["onMute"] }) {
  const muted = agents.filter((agent) => agent.muted);
  if (muted.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Muted here:</span>
      {muted.map((agent) => (
        <span key={agent.userId} className="flex items-center gap-1">
          <span className="font-mono">@{agent.handle}</span>
          {agent.canMute ? <Button variant="ghost" size="xs" onClick={() => void onMute(agent.handle, false)}>Unmute</Button> : null}
        </span>
      ))}
    </div>
  );
}

interface ThreadBodyProps {
  data: ThreadData;
  handlers: CommentHandlers;
  post: (body: string, parentId: string | null) => Promise<WriteOutcome>;
  onNotices: (outcome: WriteOutcome) => void;
}

/** The loaded thread: muted agents, comments with replies, the composer, and mention notices. */
function ThreadBody({ data, handlers, post, onNotices }: ThreadBodyProps) {
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const groups = useMemo(() => groupThread(data.comments), [data.comments]);
  const agents = useMemo(() => new Map(data.agents.map((agent) => [agent.userId, agent])), [data.agents]);
  const agentFor = (comment: CommentView) => (comment.author?.kind === "agent" ? agents.get(comment.author.userId) : undefined);
  const withReply: CommentHandlers = { ...handlers, onReply: setReplyTo };

  async function submit(body: string) {
    const outcome = await post(body, replyTo?.parentId ?? replyTo?.id ?? null);
    onNotices(outcome);
    if (outcome.ok) setReplyTo(null);
    return outcome;
  }

  return (
    <>
      <MutedAgents agents={data.agents} onMute={handlers.onMute} />
      {groups.length === 0 ? <p className="text-[13px] text-muted-foreground">No comments yet. Start the thread, and @mention a teammate or agent to bring them in.</p> : null}
      <div className="divide-y">
        {groups.map(({ root, replies }) => (
          <div key={root.id}>
            <CommentItem comment={root} agent={agentFor(root)} handlers={withReply} />
            {replies.map((item) => <CommentItem key={item.id} comment={item} agent={agentFor(item)} handlers={withReply} reply />)}
          </div>
        ))}
      </div>
      {replyTo ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          Replying to {replyTo.author?.label ?? "a former member"}
          <Button variant="ghost" size="xs" onClick={() => { setReplyTo(null); }}>Cancel reply</Button>
        </p>
      ) : null}
      <CommentComposer
        key={replyTo?.id ?? "new"}
        label={replyTo ? "Write a reply" : "Write a comment"}
        placeholder={replyTo ? "Write a reply" : "Write a comment"}
        submitLabel={replyTo ? "Reply" : "Comment"}
        autoFocus={replyTo !== null}
        onSubmit={submit}
      />
    </>
  );
}

/**
 * The comment thread for one artifact. Self-contained: give it the artifact's
 * public id and place it on any page. Signed-out readers and anyone who cannot
 * view the artifact see a short notice instead of comments.
 */
export function CommentThread({ publicId, className }: { publicId: string; className?: string }) {
  const { state, post, edit, remove, setMute } = useCommentThread(publicId);
  const [notices, setNotices] = useState<MentionOutcome | null>(null);

  function showNotices(outcome: WriteOutcome) {
    if (outcome.ok) setNotices(outcome.mentions);
  }

  const handlers: CommentHandlers = {
    onReply: () => undefined,
    onEdit: async (commentId, body) => {
      const outcome = await edit(commentId, body);
      showNotices(outcome);
      return outcome;
    },
    onDelete: remove,
    onMute: setMute,
  };

  return (
    <section aria-label="Comments" className={cn("space-y-3", className)}>
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <IconMessage className="size-4 text-muted-foreground" aria-hidden /> Comments
        {state.status === "ready" ? <span className="text-xs font-normal text-muted-foreground">{state.data.comments.filter((item) => !item.deleted).length}</span> : null}
      </h2>
      {state.status === "loading" ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><IconLoader2 className="size-3.5 animate-spin" /> Loading comments</p> : null}
      {state.status === "error" ? <p className="text-[13px] text-muted-foreground">{state.error}</p> : null}
      {state.status === "ready" ? <ThreadBody data={state.data} handlers={handlers} post={post} onNotices={showNotices} /> : null}
      <MentionNotices outcome={notices} />
    </section>
  );
}
