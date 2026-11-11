"use client";

import { IconCheck, IconLayoutSidebarLeftCollapse, IconPlus, IconSelector, IconUsers } from "@tabler/icons-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TeamIcon } from "@/components/teams/team-icon";
import { workspaceQuery } from "@/lib/projects/filter-params";
import { cn } from "@/lib/utils";

import type { ShareTeam } from "./share-teams-context";
import { hideSidebarSlot } from "./sidebar-visibility";

/** The first letter of a workspace's name, for its tile. */
function initial(name: string) {
  return (name.trim().at(0) ?? "?").toUpperCase();
}

/** A workspace's tile: a team's own icon when it has one, else its first letter. Decorative: the name beside it says which workspace. */
function WorkspaceTile({ name, iconUrl, size }: { name: string; iconUrl: string | null; size: "md" | "sm" }) {
  if (iconUrl) return <TeamIcon name={name} iconUrl={iconUrl} size={size === "md" ? 32 : 24} className="rounded-lg" />;
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center bg-foreground font-semibold text-background", size === "md" ? "size-8 rounded-lg text-sm" : "size-6 rounded-md text-xs")}>
      {initial(name)}
    </span>
  );
}

interface WorkspaceSwitcherProps {
  teams: readonly ShareTeam[];
  /** The shared team whose artifacts are shown, or null for the viewer's own. */
  scopeTeam: ShareTeam | null;
  /** The list's path: /app, or the fixture's page. */
  listPath: string;
}

/**
 * The card at the top of the sidebar: which workspace the list shows (the
 * viewer's own artifacts, or what a shared team holds) and a menu to switch
 * to another, manage teams, or create one. Switching keeps no filters, as the
 * scope tabs it replaces did.
 */
export function WorkspaceSwitcher({ teams, scopeTeam, listPath }: WorkspaceSwitcherProps) {
  const shared = teams.filter((team) => !team.personal);
  const name = scopeTeam ? scopeTeam.name : "Your artifacts";
  const kind = scopeTeam ? "Team workspace" : "Personal workspace";
  const hrefFor = (slug: string | null) => `${listPath}${workspaceQuery(slug, null)}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" />}
        aria-label={`Workspace: ${name}. Switch workspace`}
        className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[popup-open]:bg-muted"
      >
        <WorkspaceTile name={name} iconUrl={scopeTeam?.iconUrl ?? null} size="md" />
        <span className="min-w-0 flex-1">
          <span data-slot="workspace-name" className="block truncate text-md font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{kind}</span>
        </span>
        <IconSelector aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5 text-xs">Workspaces</DropdownMenuLabel>
          <SwitchItem name="Your artifacts" iconUrl={null} current={scopeTeam === null} href={hrefFor(null)} />
          {shared.map((team) => (
            <SwitchItem key={team.id} name={team.name} iconUrl={team.iconUrl ?? null} current={scopeTeam?.id === team.id} href={hrefFor(team.slug)} />
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href="/teams" />} className="px-2 py-2">
          <IconUsers aria-hidden /> Manage teams
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href="/teams/new" />} className="px-2 py-2">
          <IconPlus aria-hidden /> Create a team
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One workspace in the menu, a link to its list, with a check on the one shown. */
function SwitchItem({ name, iconUrl, current, href }: { name: string; iconUrl: string | null; current: boolean; href: string }) {
  return (
    <DropdownMenuLinkItem render={<Link href={href} />} aria-current={current ? "page" : undefined} className="px-2 py-1.5">
      <WorkspaceTile name={name} iconUrl={iconUrl} size="sm" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {current ? <IconCheck aria-label="Current workspace" className="size-4" /> : null}
    </DropdownMenuLinkItem>
  );
}

/** The button beside the switcher that hides the sidebar, from lg up, so the artifact takes the whole width. */
export function CollapseSidebarButton({ onCollapse }: { onCollapse: () => void }) {
  return (
    <button
      type="button"
      data-slot={hideSidebarSlot}
      aria-label="Hide the sidebar"
      title="Hide the sidebar"
      onClick={onCollapse}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none max-lg:hidden"
    >
      <IconLayoutSidebarLeftCollapse aria-hidden className="size-4" />
    </button>
  );
}
