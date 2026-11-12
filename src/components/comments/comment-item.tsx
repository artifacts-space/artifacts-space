"use client";

import { IconArrowBackUp, IconCheck, IconCornerDownRight, IconPencil, IconTrash, IconVolumeOff } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { MarkdownView } from "@/components/artifact-view/markdown-view";
import { PixelAvatar } from "@/components/pixel-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ThreadAgentView } from "@/lib/comments/mutes";
import { postedMentionMap } from "@/lib/comments/mentions";
import type { CommentView } from "@/lib/comments/views";
import { cn } from "@/lib/utils";

import { CommentComposer } from "./comment-composer";
import type { WriteOutcome } from "./use-comment-thread";

const timeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export interface CommentHandlers {
  onReply: (comment: CommentView) => void;
  onEdit: (commentId: string, body: string) => Promise<WriteOutcome>;
  onDelete: (commentId: string) => Promise<WriteOutcome>;
  onMute: (handle: string, muted: boolean) => Promise<WriteOutcome>;
  /** Resolves a thread by its top-level comment, or reopens it. Without it, threads cannot be resolved here. */
  onResolve?: ((commentId: string, resolved: boolean) => Promise<WriteOutcome>) | undefined;
}

/** Where an inline comment's words are for this viewer: on the page, changed or deleted since, or not known here. */
export type AnchorPlace = "here" | "changed" | "unknown";

/** What a list of comments knows about the artifact's text: where each inline comment's words are, and how to show them. */
export interface AnchorLookup {
  placeOf: (comment: CommentView) => AnchorPlace;
  /** Scrolls to the words and opens the thread there. */
  onShow: (commentId: string) => void;
}

/** Why an inline comment's words are not shown as a way to the text, or null when they are on the page. */
function anchorNote(comment: CommentView, place: AnchorPlace): string | null {
  if (!comment.anchor) return "On text that is not in the version you see";
  return place === "changed" ? "On text that changed" : null;
}

const quoteFrame = "block w-full border-l-2 border-(--block-yellow) pl-2.5 text-left text-sm leading-5 text-muted-foreground";

/** The quoted words: a button that goes to them when they are on the page, else plain text. */
function QuotedWords({ comment, quote, lookup, place }: { comment: CommentView; quote: string; lookup: AnchorLookup | undefined; place: AnchorPlace }) {
  const words = <span className="line-clamp-2">{quote}</span>;
  if (!lookup || place !== "here") return <p className={quoteFrame}>{words}</p>;
  return (
    <button type="button" title="Show in the text" onClick={() => { lookup.onShow(comment.id); }} className={cn(quoteFrame, "rounded-r-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50")}>
      <span className="sr-only">Show in the text: </span>{words}
    </button>
  );
}

/**
 * The words an inline comment was made on, above its text. When they are on
 * the page it is a button that goes to them; when they changed, it says so
 * and the comment stays in the list.
 */
function AnchorQuote({ comment, lookup }: { comment: CommentView; lookup: AnchorLookup | undefined }) {
  if (!comment.anchored || comment.deleted) return null;
  const place = lookup?.placeOf(comment) ?? "unknown";
  const note = anchorNote(comment, place);
  return (
    <div data-slot="comment-anchor" data-anchor-place={comment.anchor ? place : "hidden"} className="space-y-0.5">
      {comment.anchor ? <QuotedWords comment={comment} quote={comment.anchor.quote} lookup={lookup} place={place} /> : null}
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** Resolve on an open thread's first comment, Reopen on a resolved one, for viewers who may. */
function ResolveButton({ comment, busy, act, onResolve }: { comment: CommentView; busy: boolean; act: (run: () => Promise<WriteOutcome>) => Promise<void>; onResolve: CommentHandlers["onResolve"] }) {
  if (!comment.canResolve || !onResolve) return null;
  const resolved = comment.resolved !== null;
  return (
    <Button variant="ghost" size="xs" className="text-muted-foreground" disabled={busy} onClick={() => void act(() => onResolve(comment.id, !resolved))}>
      {resolved ? <><IconArrowBackUp /> Reopen</> : <><IconCheck /> Resolve</>}
    </Button>
  );
}

function AuthorBadges({ isAgent, muted }: { isAgent: boolean; muted: boolean }) {
  return (
    <>
      {isAgent ? <Badge variant="secondary">Agent</Badge> : null}
      {muted ? <Badge variant="outline">Muted</Badge> : null}
    </>
  );
}

function AuthorLine({ comment, agent }: { comment: CommentView; agent: ThreadAgentView | undefined }) {
  const isAgent = comment.author?.kind === "agent";
  const muted = Boolean(agent && (agent.muted || agent.teamMuted));
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {comment.author ? <PixelAvatar seed={comment.author.userId} kind={comment.author.kind} size={20} /> : null}
      <span className="font-medium">{comment.author?.label ?? "Former member"}</span>
      <AuthorBadges isAgent={isAgent} muted={muted} />
      <time dateTime={comment.createdAt} className="text-muted-foreground">{timeFormat.format(new Date(comment.createdAt))} UTC</time>
      {comment.edited ? <span className="text-muted-foreground">· edited</span> : null}
    </div>
  );
}

function CommentActions({ comment, agent, handlers, onEditing }: { comment: CommentView; agent: ThreadAgentView | undefined; handlers: CommentHandlers; onEditing: () => void }) {
  const [busy, setBusy] = useState(false);
  async function act(run: () => Promise<WriteOutcome>) {
    setBusy(true);
    await run();
    setBusy(false);
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => { handlers.onReply(comment); }}>
        <IconCornerDownRight /> Reply
      </Button>
      <ResolveButton comment={comment} busy={busy} act={act} onResolve={handlers.onResolve} />
      {comment.canChange ? (
        <>
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={onEditing}><IconPencil /> Edit</Button>
          <Button variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => void act(() => handlers.onDelete(comment.id))}>
            <IconTrash /> Delete
          </Button>
        </>
      ) : null}
      {agent?.canMute && !agent.muted ? (
        <Button variant="ghost" size="xs" className="text-muted-foreground" disabled={busy} onClick={() => void act(() => handlers.onMute(agent.handle, true))}>
          <IconVolumeOff /> Mute @{agent.handle} here
        </Button>
      ) : null}
    </div>
  );
}

interface CommentItemProps {
  comment: CommentView;
  agent: ThreadAgentView | undefined;
  handlers: CommentHandlers;
  reply?: boolean;
  /** For a list beside the artifact's text: where inline comments' words are. Without it the words still show, as plain text. */
  anchors?: AnchorLookup | undefined;
  /** False where the comment already sits at its words (the card at the text), so they are not repeated. */
  showAnchor?: boolean;
}

/** A comment that is not deleted: its text and actions, or the box to edit it. */
function LiveComment({ comment, agent, handlers }: Pick<CommentItemProps, "comment" | "agent" | "handlers">) {
  const [editing, setEditing] = useState(false);
  const mentions = useMemo(() => postedMentionMap(comment.mentions, comment.author), [comment.mentions, comment.author]);
  if (editing) {
    return (
      <CommentComposer
        label="Edit comment"
        placeholder="Edit your comment"
        submitLabel="Save"
        initialBody={comment.body}
        autoFocus
        onCancel={() => { setEditing(false); }}
        onSubmit={async (body) => {
          const outcome = await handlers.onEdit(comment.id, body);
          if (outcome.ok) setEditing(false);
          return outcome;
        }}
      />
    );
  }
  return (
    <>
      <MarkdownView content={comment.body} mentions={mentions} className="text-md leading-6" />
      <CommentActions comment={comment} agent={agent} handlers={handlers} onEditing={() => { setEditing(true); }} />
    </>
  );
}

/** One comment: author, the words it was made on (an inline comment), markdown body, and the viewer's actions. */
export function CommentItem({ comment, agent, handlers, reply = false, anchors, showAnchor = true }: CommentItemProps) {
  return (
    <article id={`comment-${comment.id}`} className={cn("scroll-mt-20 space-y-1.5 py-3", reply && "border-l pl-4")}>
      <AuthorLine comment={comment} agent={agent} />
      {showAnchor ? <AnchorQuote comment={comment} lookup={anchors} /> : null}
      {comment.deleted ? <p className="text-md text-muted-foreground italic">This comment was deleted.</p> : <LiveComment comment={comment} agent={agent} handlers={handlers} />}
    </article>
  );
}
