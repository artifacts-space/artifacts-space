"use client";

import { IconCheck, IconChecks, IconLoader2 } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { markInboxReadAction } from "@/app/(workspace)/inbox/actions";
import { PixelAvatar } from "@/components/pixel-avatar";
import { Button } from "@/components/ui/button";
import type { InboxEntryView } from "@/lib/comments/inbox";
import { cn } from "@/lib/utils";

const timeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const SNIPPET_LENGTH = 180;

function snippet(body: string) {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_LENGTH ? `${flat.slice(0, SNIPPET_LENGTH - 1)}…` : flat;
}

function EntryRow({ entry, pending, onRead }: { entry: InboxEntryView; pending: boolean; onRead: (id: string) => void }) {
  const unread = entry.readAt === null;
  const author = entry.comment.author;
  return (
    <li className={cn("flex gap-3 border-t px-5 py-3 first:border-t-0", unread ? "bg-card" : "bg-background/60")}>
      <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", unread ? "bg-foreground" : "bg-transparent")} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13px]">
          {author ? <PixelAvatar seed={author.userId} kind={author.kind} size={20} /> : null}
          <span className="font-medium">{author?.label ?? "Former member"}</span>
          <span className="text-muted-foreground">mentioned you on</span>
          <Link href={`/threads/${entry.artifact.publicId}#comment-${entry.comment.id}`} className="truncate font-medium underline decoration-border underline-offset-[3px] hover:decoration-foreground">
            {entry.artifact.title}
          </Link>
        </p>
        <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{snippet(entry.comment.body)}</p>
        <p className="text-[11px] text-muted-foreground">{timeFormat.format(new Date(entry.createdAt))} UTC</p>
      </div>
      {unread ? (
        <Button variant="ghost" size="sm" className="shrink-0 text-xs" disabled={pending} onClick={() => { onRead(entry.id); }}>
          <IconCheck /> Mark read
        </Button>
      ) : null}
    </li>
  );
}

/** Mentions of the viewer, unread first. Opening a thread marks its mentions read. */
export function InboxList({ entries }: { entries: InboxEntryView[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const unread = entries.filter((entry) => entry.readAt === null).length;

  async function mark(ids: string[] | "all") {
    setPending(ids === "all" ? "all" : ids.join(","));
    try {
      const result = await markInboxReadAction(ids);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-md border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <p className="text-[13px] text-muted-foreground">{unread === 0 ? "You are all caught up." : `${String(unread)} unread`}</p>
        {unread > 0 ? (
          <Button variant="outline" size="sm" className="text-xs" disabled={pending !== null} onClick={() => void mark("all")}>
            {pending === "all" ? <IconLoader2 className="animate-spin" /> : <IconChecks />} Mark all read
          </Button>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">No mentions yet. When a teammate or an agent @mentions you in a comment, it shows up here.</p>
      ) : (
        <ul>{entries.map((entry) => <EntryRow key={entry.id} entry={entry} pending={pending !== null} onRead={(id) => void mark([id])} />)}</ul>
      )}
    </section>
  );
}
