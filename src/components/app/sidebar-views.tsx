"use client";

import { IconClock, IconStack2, IconUsers, IconWorld } from "@tabler/icons-react";

import type { ViewCounts, WorkspaceView } from "@/lib/projects/sidebar-view-rules";
import { cn } from "@/lib/utils";

const views: { view: WorkspaceView; label: string; icon: typeof IconStack2; hint: string }[] = [
  { view: "all", label: "All artifacts", icon: IconStack2, hint: "Every artifact in this workspace" },
  { view: "recent", label: "Recent", icon: IconClock, hint: "Edited in the last 7 days" },
  { view: "shared", label: "Shared with me", icon: IconUsers, hint: "Written by someone else" },
  { view: "public", label: "Public", icon: IconWorld, hint: "Anyone can find and read them" },
];

/** A view's count, or null for Recent, whose seven days move with the clock. */
function countOf(counts: ViewCounts, view: WorkspaceView): number | null {
  return view === "recent" ? null : counts[view];
}

/**
 * The sidebar's views over the workspace's list: All artifacts, Recent,
 * Shared with me, and Public. Picking one narrows the project tree below it;
 * the counts come from the list the workspace already holds.
 */
export function SidebarViews({ view, counts, onView }: { view: WorkspaceView; counts: ViewCounts; onView: (view: WorkspaceView) => void }) {
  return (
    <nav aria-label="Views">
      {/* Buttons, not list items: the tree's list items are artifacts only. */}
      <div className="space-y-px">
        {views.map((item) => {
          const active = item.view === view;
          const count = countOf(counts, item.view);
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              type="button"
              aria-pressed={active}
              title={item.hint}
              onClick={() => { onView(item.view); }}
              className={cn(
                "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {count === null ? null : <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
