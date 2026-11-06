"use client";

import { IconCornerDownRight, IconPencil, IconRobot, IconTrash, IconVolumeOff } from "@tabler/icons-react";
import { useState } from "react";

import { MarkdownView } from "@/components/artifact-view/markdown-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ThreadAgentView } from "@/lib/comments/mutes";
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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {isAgent ? <IconRobot className="size-3.5 text-muted-foreground" aria-hidden /> : null}
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

/** One comment: author, markdown body, and the viewer's actions. */
export function CommentItem({ comment, agent, handlers, reply = false }: { comment: CommentView; agent: ThreadAgentView | undefined; handlers: CommentHandlers; reply?: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <article id={`comment-${comment.id}`} className={cn("scroll-mt-20 space-y-1.5 py-3", reply && "border-l pl-4")}>
      <AuthorLine comment={comment} agent={agent} />
      {comment.deleted ? <p className="text-[13px] text-muted-foreground italic">This comment was deleted.</p> : null}
      {!comment.deleted && editing ? (
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
      ) : null}
      {!comment.deleted && !editing ? <MarkdownView content={comment.body} className="text-[13px] leading-6" /> : null}
      {!comment.deleted && !editing ? <CommentActions comment={comment} agent={agent} handlers={handlers} onEditing={() => { setEditing(true); }} /> : null}
    </article>
  );
}
