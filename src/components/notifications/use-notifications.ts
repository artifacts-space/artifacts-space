"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { countNotificationsAction, loadNotificationsAction, markNotificationsReadAction } from "@/app/(workspace)/app/notification-actions";
import type { NotificationView } from "@/lib/notifications/feed";

import { onNotificationsChanged } from "./notification-events";

/** What the bell shows: the unread count, and the list once it has been opened. */
export interface NotificationsState {
  unread: number;
  items: NotificationView[] | null;
  /** The list failed to load and there is nothing to show. */
  failed: boolean;
}

/**
 * The bell's data, without polling. The count comes from the page; it is
 * fetched again when the tab gets focus or becomes visible, when the person
 * opens the bell, after their own actions (opening a thread, marking read),
 * and when a browser notification arrives. `seed` fills the list for the
 * dev fixture, which has no database.
 */
export function useNotifications(initialUnread: number, seed?: NotificationView[]) {
  const [state, setState] = useState<NotificationsState>({ unread: initialUnread, items: seed ?? null, failed: false });
  const listOpen = useRef(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (listOpen.current) {
        const result = await loadNotificationsAction();
        setState((current) => (result.success ? { unread: result.data.unread, items: result.data.items, failed: false } : { ...current, failed: current.items === null }));
        return;
      }
      const result = await countNotificationsAction();
      if (result.success) setState((current) => ({ ...current, unread: result.data }));
    } catch {
      setState((current) => ({ ...current, failed: listOpen.current && current.items === null }));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const stop = onNotificationsChanged(() => void refresh());
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [refresh]);

  /** The bell opened or closed. Opening loads the list. */
  const setOpen = useCallback(
    (open: boolean) => {
      listOpen.current = open;
      if (open) void refresh();
    },
    [refresh],
  );

  /** Marks some (or all) read at once on screen, then on the server, then catches up. */
  const markRead = useCallback(
    async (ids: string[] | "all") => {
      const now = new Date().toISOString();
      const hits = (item: NotificationView) => item.readAt === null && (ids === "all" || ids.includes(item.id));
      setState((current) => {
        const changed = current.items?.filter(hits).length ?? 0;
        const unread = ids === "all" ? 0 : Math.max(current.unread - changed, 0);
        return { ...current, unread, items: current.items?.map((item) => (hits(item) ? { ...item, readAt: now } : item)) ?? null };
      });
      try {
        await markNotificationsReadAction(ids);
      } catch {
        // The next refresh shows the truth.
      }
      await refresh();
    },
    [refresh],
  );

  return { state, setOpen, markRead };
}
