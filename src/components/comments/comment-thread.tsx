"use client";

import { IconChevronRight, IconLoader2, IconMessage } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ThreadData } from "@/app/(workspace)/threads/actions";
import { PixelAvatar } from "@/components/pixel-avatar";
import { Button } from "@/components/ui/button";
import { useInlineComments, type InlineComments } from "@/components/inline-comments/inline-comments-context";
import type { MentionOutcome } from "@/lib/comments/delivery";
import type { ThreadAgentView } from "@/lib/comments/mutes";
import type { CommentView } from "@/lib/comments/views";
import { cn } from "@/lib/utils";

import { CommentComposer } from "./comment-composer";
import { CommentItem, type AnchorLookup, type CommentHandlers } from "./comment-item";
import { MentionablesProvider } from "./mentionables-context";
import { takeQuotedComment, usePendingQuote } from "./quote-request";
import { useCommentThread, type CommentThreadControl, type WriteOutcome } from "./use-comment-thread";

/** A top-level comment with its replies. */
export interface ThreadGroup {
  root: CommentView;
  replies: CommentView[];
}

/** Top-level comments, each with its replies. */
export function groupThread(comments: readonly CommentView[]): ThreadGroup[] {
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
export function MentionNotices({ outcome }: { outcome: MentionOutcome | null }) {
  if (!outcome || (outcome.refused.length === 0 && outcome.notified.length === 0)) return null;
  return (
    <div role="status" className="space-y-1 rounded-md border bg-muted/50 px-3 py-2 text-sm leading-5">
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
          <PixelAvatar seed={agent.userId} kind="agent" size={16} />
          <span className="font-mono">@{agent.handle}</span>
          {agent.canMute ? <Button variant="ghost" size="xs" onClick={() => void onMute(agent.handle, false)}>Unmute</Button> : null}
        </span>
      ))}
    </div>
  );
}

/** A new comment started from a block's menu: its opening text, and a count so each one starts a fresh composer. */
interface StartedComment {
  body: string;
  count: number;
}

/**
 * A quote the block menu sent to this artifact's comments (quote-request.ts),
 * kept once taken so the composer holds it until it is posted.
 */
function useStartedComment(publicId: string): [StartedComment | null, () => void] {
  const pending = usePendingQuote(publicId);
  const [started, setStarted] = useState<StartedComment | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  if (pending !== seen) {
    setSeen(pending);
    if (pending !== null) setStarted({ body: pending, count: (started?.count ?? 0) + 1 });
  }
  useEffect(() => {
    if (pending !== null) takeQuotedComment(publicId);
  }, [pending, publicId]);
  return [started, () => { setStarted(null); }];
}

interface ThreadComposerProps {
  replyTo: CommentView | null;
  started: StartedComment | null;
  onCancelReply: () => void;
  onSubmit: (body: string) => Promise<WriteOutcome>;
  raised: boolean;
}

/** The composer's set-up: a reply, a new comment that quotes a block, or a blank new comment. */
function composerSetup(replyTo: CommentView | null, started: StartedComment | null) {
  if (replyTo) return { key: replyTo.id, initialBody: "", label: "Write a reply", submitLabel: "Reply", autoFocus: true };
  if (started) return { key: `quote-${String(started.count)}`, initialBody: started.body, label: "Write a comment", submitLabel: "Comment", autoFocus: true };
  return { key: "new", initialBody: "", label: "Write a comment", submitLabel: "Comment", autoFocus: false };
}

/** The composer under the thread: a new comment (perhaps quoting a block), or a reply to the picked comment. */
function ThreadComposer({ replyTo, started, onCancelReply, onSubmit, raised }: ThreadComposerProps) {
  const setup = composerSetup(replyTo, started);
  return (
    <>
      {replyTo ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          Replying to {replyTo.author?.label ?? "a former member"}
          <Button variant="ghost" size="xs" onClick={onCancelReply}>Cancel reply</Button>
        </p>
      ) : null}
      <div className={cn(raised && "card-surface p-3 sm:p-4")}>
        <CommentComposer
          key={setup.key}
          initialBody={setup.initialBody}
          label={setup.label}
          placeholder={setup.label}
          submitLabel={setup.submitLabel}
          autoFocus={setup.autoFocus}
          onSubmit={onSubmit}
        />
      </div>
    </>
  );
}

interface ThreadGroupsProps {
  groups: ThreadGroup[];
  agentFor: (comment: CommentView) => ThreadAgentView | undefined;
  handlers: CommentHandlers;
  anchors: AnchorLookup | undefined;
  raised: boolean;
}

/** Threads one after another: each top-level comment, then its replies. */
function ThreadGroups({ groups, agentFor, handlers, anchors, raised }: ThreadGroupsProps) {
  return (
    <div className={cn("divide-y", raised && groups.length > 0 && "card-surface px-4 sm:px-5")}>
      {groups.map(({ root, replies }) => (
        <div key={root.id} data-slot="comment-group" data-resolved={root.resolved !== null}>
          <CommentItem comment={root} agent={agentFor(root)} handlers={handlers} anchors={anchors} />
          {replies.map((item) => <CommentItem key={item.id} comment={item} agent={agentFor(item)} handlers={handlers} reply />)}
        </div>
      ))}
    </div>
  );
}

/** Resolved threads, folded away under the open ones until asked for. */
function ResolvedThreads(props: ThreadGroupsProps) {
  const [shown, setShown] = useState(false);
  if (props.groups.length === 0) return null;
  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" aria-expanded={shown} className="-ml-2 text-muted-foreground" onClick={() => { setShown(!shown); }}>
        <IconChevronRight className={cn("transition-transform motion-reduce:transition-none", shown && "rotate-90")} /> Resolved
        <span className="text-xs font-normal">{props.groups.length}</span>
      </Button>
      {shown ? <ThreadGroups {...props} /> : null}
    </div>
  );
}

interface ThreadBodyProps {
  publicId: string;
  data: ThreadData;
  handlers: CommentHandlers;
  post: (body: string, parentId: string | null) => Promise<WriteOutcome>;
  onNotices: (outcome: WriteOutcome) => void;
  raised: boolean;
  anchors: AnchorLookup | undefined;
}

/** The loaded thread: muted agents, comments with replies, the composer, and mention notices. */
function ThreadBody({ publicId, data, handlers, post, onNotices, raised, anchors }: ThreadBodyProps) {
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const [started, clearStarted] = useStartedComment(publicId);
  const groups = useMemo(() => groupThread(data.comments), [data.comments]);
  const open = useMemo(() => groups.filter((group) => !group.root.resolved), [groups]);
  const resolved = useMemo(() => groups.filter((group) => group.root.resolved), [groups]);
  const agents = useMemo(() => new Map(data.agents.map((agent) => [agent.userId, agent])), [data.agents]);
  const agentFor = (comment: CommentView) => (comment.author?.kind === "agent" ? agents.get(comment.author.userId) : undefined);
  const withReply: CommentHandlers = { ...handlers, onReply: setReplyTo };

  async function submit(body: string) {
    const outcome = await post(body, replyTo?.parentId ?? replyTo?.id ?? null);
    onNotices(outcome);
    if (!outcome.ok) return outcome;
    // Once posted, a quoted comment is done: the next new comment starts blank.
    if (!replyTo) clearStarted();
    setReplyTo(null);
    return outcome;
  }

  return (
    <>
      <MutedAgents agents={data.agents} onMute={handlers.onMute} />
      {groups.length === 0 ? <p className="text-md text-muted-foreground">No comments yet. Start the thread, and @mention a teammate or agent to bring them in.</p> : null}
      <ThreadGroups groups={open} agentFor={agentFor} handlers={withReply} anchors={anchors} raised={raised} />
      <ResolvedThreads groups={resolved} agentFor={agentFor} handlers={withReply} anchors={anchors} raised={raised} />
      <ThreadComposer replyTo={replyTo} started={started} onCancelReply={() => { setReplyTo(null); }} onSubmit={submit} raised={raised} />
    </>
  );
}

interface ThreadSectionProps {
  publicId: string;
  thread: CommentThreadControl;
  anchors?: AnchorLookup | undefined;
  className?: string | undefined;
  raised: boolean;
}

/** The Comments section over one loaded thread: heading, count, the threads, and the composer. */
function ThreadSection({ publicId, thread, anchors, className, raised }: ThreadSectionProps) {
  const { state, post, edit, remove, setMute, resolve } = thread;
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
    onResolve: resolve,
  };

  return (
    <section aria-label="Comments" className={cn("space-y-3", className)}>
      <h2 className="flex items-center gap-2 text-md font-medium">
        <IconMessage className="size-4 text-muted-foreground" aria-hidden /> Comments
        {state.status === "ready" ? <span className="text-xs font-normal text-muted-foreground">{state.data.comments.filter((item) => !item.deleted).length}</span> : null}
      </h2>
      {state.status === "loading" ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><IconLoader2 className="size-3.5 animate-spin" /> Loading comments</p> : null}
      {state.status === "error" ? <p className="text-sm text-muted-foreground">{state.error}</p> : null}
      {state.status === "ready" ? (
        <MentionablesProvider publicId={publicId}>
          <ThreadBody publicId={publicId} data={state.data} handlers={handlers} post={post} onNotices={showNotices} raised={raised} anchors={anchors} />
        </MentionablesProvider>
      ) : null}
      <MentionNotices outcome={notices} />
    </section>
  );
}

/** The thread loaded by this section itself, where nothing around it shares one. */
function OwnThread({ publicId, className, raised }: { publicId: string; className?: string | undefined; raised: boolean }) {
  const thread = useCommentThread(publicId);
  return <ThreadSection publicId={publicId} thread={thread} className={className} raised={raised} />;
}

/**
 * The thread the artifact's inline comments already loaded: the same data as
 * the highlights in the text, so a comment made at the text shows here at
 * once. Opening the list marks the thread read, as loading it used to, and
 * a list opened after the thread loaded (the Comments dialog) loads it again
 * first, so it shows comments made since.
 */
function SharedThread({ inline, className, raised }: { inline: InlineComments; className?: string | undefined; raised: boolean }) {
  const { thread, ready, located, reveal } = inline;
  const { markRead, reload } = thread;
  const loadedBefore = useRef(thread.state.status === "ready");
  useEffect(() => {
    void (loadedBefore.current ? reload().then(markRead) : markRead());
  }, [markRead, reload]);
  const anchors = useMemo<AnchorLookup>(
    () => ({
      placeOf: (comment) => {
        if (!ready || comment.resolved) return "unknown";
        return located.has(comment.id) ? "here" : "changed";
      },
      onShow: (commentId) => { reveal(commentId); },
    }),
    [ready, located, reveal],
  );
  return <ThreadSection publicId={inline.publicId} thread={thread} anchors={anchors} className={className} raised={raised} />;
}

/**
 * The comment thread for one artifact. Self-contained: give it the artifact's
 * public id and place it on any page. Signed-out readers and anyone who cannot
 * view the artifact see a short notice instead of comments. Set `raised` when
 * the thread sits directly on the page, so the comments and the composer show
 * as cards; leave it off inside a card, which must not nest card shadows.
 * Inside an artifact's inline comments (InlineCommentsProvider) it shows
 * their thread, with each inline comment's words and a way to them.
 */
export function CommentThread({ publicId, className, raised = false }: { publicId: string; className?: string; raised?: boolean }) {
  const inline = useInlineComments();
  if (inline?.publicId === publicId) return <SharedThread inline={inline} className={className} raised={raised} />;
  return <OwnThread publicId={publicId} className={className} raised={raised} />;
}
