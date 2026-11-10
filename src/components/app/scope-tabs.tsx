"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import type { ShareTeam } from "./share-teams-context";

/**
 * Mine, then one tab per shared team, in one row that scrolls sideways when it
 * runs out of room. The active scope comes from the URL, and its tab is
 * scrolled into view on arrival: the page heading is for screen readers only,
 * so the tab is what tells sighted people which scope they see.
 */
export function ScopeTabs({ teams, activeSlug }: { teams: readonly ShareTeam[]; activeSlug: string | null }) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const active = activeRef.current;
    const row = active?.parentElement;
    if (!active || !row) return;
    // Only the row scrolls; scrollIntoView could move the page as well.
    const overflow = active.offsetLeft + active.offsetWidth - row.clientWidth;
    if (overflow > 0) row.scrollLeft = overflow + 8;
  }, [activeSlug]);

  const tabs = [{ key: "mine", label: "Mine", href: "/app", active: activeSlug === null }].concat(
    teams
      .filter((team) => !team.personal)
      .map((team) => ({ key: team.id, label: team.name, href: `/app?team=${encodeURIComponent(team.slug)}`, active: team.slug === activeSlug })),
  );
  if (tabs.length === 1) return null;
  return (
    <nav aria-label="Artifact scope" className="relative -m-0.5 flex min-w-0 gap-1 overflow-x-auto p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          ref={tab.active ? activeRef : undefined}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-sm px-2.5 py-1 text-sm whitespace-nowrap transition-colors",
            tab.active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
