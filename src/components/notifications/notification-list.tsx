"use client";

import { IconCheck } from "@tabler/icons-react";
import Link from "next/link";

import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
import { PixelAvatar } from "@/components/pixel-avatar";
import { actionPhrase, actorsLabel, groupActorIds, groupNotifications, type NotificationGroup } from "@/lib/notifications/display-rules";
import type { NotificationView } from "@/lib/notifications/feed";
import { formatExactTime, formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

type Group = NotificationGroup<NotificationView>;

/** The unique actor labels in a group, newest first. */
function groupLabels(items: readonly NotificationView[]) {
  const ids = groupActorIds(items);
  const labels = ids.map((id) => items.find((item) => item.actor?.userId === id)?.actor?.label ?? "Someone");
  return items.some((item) => item.actor === null) ? [...labels, "a former member"] : labels;
}

interface RowProps {
  group: Group;
  now: Date;
  onOpen: (group: Group) => void;
  onRead: (group: Group) => void;
}

/** One row: who, what, which artifact, a short excerpt, and when. The whole row opens it. */
function NotificationRow({ group, now, onOpen, onRead }: RowProps) {
  const [newest] = group.items;
  if (!newest) return null;
  const at = new Date(newest.createdAt);
  return (
    <li className="relative">
      <Link
        href={newest.href}
        onClick={() => { onOpen(group); }}
        className={cn("flex gap-3 rounded-md px-2.5 py-2.5 pr-9 transition-colors hover:bg-muted", group.unread ? "" : "text-muted-foreground")}
      >
        <span className="mt-0.5 shrink-0">
          {newest.actor ? <PixelAvatar seed={newest.actor.userId} kind={newest.actor.kind} size={24} /> : <span aria-hidden className="block size-6 rounded-full bg-muted" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-5">
            <span className={cn("font-medium", group.unread && "text-foreground")}>{actorsLabel(groupLabels(group.items))}</span>{" "}
            <span className="text-muted-foreground">{actionPhrase(newest.type, newest.requestKind)}</span>{" "}
            {newest.artifact.icon ? <ArtifactIcon icon={newest.artifact.icon} className="mr-0.5 inline-block size-3.5 align-[-2px]" /> : null}
            <span className={cn("font-medium break-words", group.unread && "text-foreground")}>{newest.artifact.title || "Untitled"}</span>
          </span>
          {newest.excerpt ? <span className="mt-0.5 line-clamp-2 block text-sm leading-5 text-muted-foreground">{newest.excerpt}</span> : null}
          <time dateTime={newest.createdAt} title={formatExactTime(at)} className="mt-0.5 block text-xs text-muted-foreground">
            {formatRelativeTime(at, now)}
          </time>
        </span>
      </Link>
      {group.unread ? (
        <button
          type="button"
          onClick={() => { onRead(group); }}
          aria-label="Mark read"
          title="Mark read"
          className="group/read absolute top-2 right-1.5 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:bg-background"
        >
          {/* The unread dot turns into a check on hover or focus. */}
          <span aria-hidden className="size-2 rounded-full bg-foreground group-hover/read:hidden group-focus-visible/read:hidden" />
          <IconCheck aria-hidden className="hidden size-4 group-hover/read:block group-focus-visible/read:block" />
        </button>
      ) : null}
    </li>
  );
}

function Section({ title, groups, now, onOpen, onRead }: { title: string; groups: Group[]; now: Date; onOpen: RowProps["onOpen"]; onRead: RowProps["onRead"] }) {
  if (groups.length === 0) return null;
  return (
    <section aria-label={title}>
      <h3 className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="space-y-0.5">
        {groups.map((group) => <NotificationRow key={group.key} group={group} now={now} onOpen={onOpen} onRead={onRead} />)}
      </ul>
    </section>
  );
}

interface NotificationListProps {
  items: NotificationView[];
  onOpen: (ids: string[]) => void;
  onRead: (ids: string[]) => void;
}

/** The bell's list: new ones first, then earlier ones, with comments on one artifact folded together. */
export function NotificationList({ items, onOpen, onRead }: NotificationListProps) {
  const groups = groupNotifications(items);
  const now = new Date();
  const unreadIds = (group: Group) => group.items.filter((item) => item.readAt === null).map((item) => item.id);
  const open = (group: Group) => { onOpen(unreadIds(group)); };
  const read = (group: Group) => { onRead(unreadIds(group)); };
  if (groups.length === 0) {
    return <p className="px-4 py-8 text-center text-md text-muted-foreground">You are all caught up. Comments, mentions, and sharing requests show up here.</p>;
  }
  return (
    <div className="space-y-1">
      <Section title="New" groups={groups.filter((group) => group.unread)} now={now} onOpen={open} onRead={read} />
      <Section title="Earlier" groups={groups.filter((group) => !group.unread)} now={now} onOpen={open} onRead={read} />
    </div>
  );
}
