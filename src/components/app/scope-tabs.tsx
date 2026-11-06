import Link from "next/link";

import { cn } from "@/lib/utils";

import type { ShareTeam } from "./share-teams-context";

/** Mine, then one tab per shared team. The active scope comes from the URL. */
export function ScopeTabs({ teams, activeSlug }: { teams: readonly ShareTeam[]; activeSlug: string | null }) {
  const tabs = [{ key: "mine", label: "Mine", href: "/app", active: activeSlug === null }].concat(
    teams
      .filter((team) => !team.personal)
      .map((team) => ({ key: team.id, label: team.name, href: `/app?team=${encodeURIComponent(team.slug)}`, active: team.slug === activeSlug })),
  );
  if (tabs.length === 1) return null;
  return (
    <nav aria-label="Artifact scope" className="mb-4 flex flex-wrap gap-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "rounded-sm px-2.5 py-1 text-sm transition-colors",
            tab.active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
