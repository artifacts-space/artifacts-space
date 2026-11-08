"use client";

import { IconBell, IconChecks, IconLoader2, IconSettings } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import type { NotificationView } from "@/lib/notifications/feed";

import { NotificationList } from "./notification-list";
import { useNotifications } from "./use-notifications";

/** The badge: the count, capped like the unread count itself. */
function badgeText(count: number) {
  return count > 49 ? "50+" : String(count);
}

function ListBody({ items, failed, onOpen, onRead }: { items: NotificationView[] | null; failed: boolean; onOpen: (ids: string[]) => void; onRead: (ids: string[]) => void }) {
  if (items) return <NotificationList items={items} onOpen={onOpen} onRead={onRead} />;
  if (failed) return <p className="px-4 py-8 text-center text-md text-muted-foreground">Notifications could not be loaded. Close and open the bell to try again.</p>;
  return (
    <p className="flex items-center justify-center gap-2 px-4 py-8 text-md text-muted-foreground" role="status">
      <IconLoader2 className="size-4 animate-spin" aria-hidden /> Loading
    </p>
  );
}

interface NotificationBellProps {
  /** Unread notifications when the page rendered. */
  initialUnread: number;
  /** A list to show without a database (the dev fixture). */
  seed?: NotificationView[];
}

/**
 * The bell in the app header: the unread count, and a list of comments,
 * mentions, and sharing requests. Opening one marks it read. It refreshes on
 * focus and after the person's own actions, never on a timer.
 */
export function NotificationBell({ initialUnread, seed }: NotificationBellProps) {
  const { state, setOpen: track, markRead } = useNotifications(initialUnread, seed);
  const [open, setOpen] = useState(false);
  const label = state.unread > 0 ? `Notifications, ${String(state.unread)} unread` : "Notifications";

  function changeOpen(next: boolean) {
    setOpen(next);
    track(next);
  }

  function opened(ids: string[]) {
    changeOpen(false);
    if (ids.length > 0) void markRead(ids);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label={label} />}>
        <IconBell className="size-4.5" aria-hidden />
        {state.unread > 0 ? (
          <span aria-hidden className="absolute top-0.5 right-0 min-w-4.5 rounded-full bg-foreground px-1 text-center text-xs leading-4.5 font-medium text-background">
            {badgeText(state.unread)}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-[min(36rem,var(--available-height))] w-[min(24rem,calc(100vw-2rem))] flex-col p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <PopoverTitle className="px-1">Notifications</PopoverTitle>
          <Button variant="ghost" size="sm" disabled={state.unread === 0} onClick={() => void markRead("all")}>
            <IconChecks /> Mark all read
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
          <ListBody items={state.items} failed={state.failed} onOpen={opened} onRead={(ids) => void markRead(ids)} />
        </div>
        <div className="border-t p-1.5">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" nativeButton={false} render={<Link href="/app/settings" onClick={() => { changeOpen(false); }} />}>
            <IconSettings /> Notification settings
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
