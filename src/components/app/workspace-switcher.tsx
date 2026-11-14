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

import type { ShareTeam } from "./share-teams-context";
import { hideSidebarSlot } from "./sidebar-visibility";

interface WorkspaceSwitcherProps {
  teams: readonly ShareTeam[];
  /** The shared team whose artifacts are shown, or null for the viewer's own. */
  scopeTeam: ShareTeam | null;
  /** The list's path: /app, or the fixture's page. */
  listPath: string;
  /** The signed-in viewer, whose own avatar marks their personal workspace. */
  viewerId: string;
}

/**
 * The card at the top of the sidebar: which workspace the list shows (the
 * viewer's own artifacts, or what a shared team holds) and a menu to switch
 * to another, manage teams, or create one. Switching keeps no filters, as the
 * scope tabs it replaces did.
 */
export function WorkspaceSwitcher({ teams, scopeTeam, listPath, viewerId }: WorkspaceSwitcherProps) {
  const shared = teams.filter((team) => !team.personal);
  const name = scopeTeam ? scopeTeam.name : "Your artifacts";
  const kind = scopeTeam ? "Team workspace" : "Personal workspace";
  const hrefFor = (slug: string | null) => `${listPath}${workspaceQuery(slug, null)}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" />}
        aria-label={`Workspace: ${name}, ${kind}. Switch workspace`}
        className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[popup-open]:bg-muted"
      >
        <TeamIcon team={scopeTeam} viewerId={viewerId} size={32} />
        <span className="min-w-0 flex-1">
          <span data-slot="workspace-name" className="block truncate text-md font-medium">{name}</span>
          {/* The visible text reads "Your artifacts Personal workspace", in the label word for word. */}
          {" "}
          <span className="block truncate text-xs text-muted-foreground">{kind}</span>
        </span>
        <IconSelector aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5 text-xs">Workspaces</DropdownMenuLabel>
          <SwitchItem name="Your artifacts" team={null} viewerId={viewerId} current={scopeTeam === null} href={hrefFor(null)} />
          {shared.map((team) => (
            <SwitchItem key={team.id} name={team.name} team={team} viewerId={viewerId} current={scopeTeam?.id === team.id} href={hrefFor(team.slug)} />
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href="/teams" />} className="px-2 py-2 pointer-coarse:min-h-11">
          <IconUsers aria-hidden /> Manage teams
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href="/teams/new" />} className="px-2 py-2 pointer-coarse:min-h-11">
          <IconPlus aria-hidden /> Create a team
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One workspace in the menu, a link to its list, with its avatar and a check on the one shown. */
function SwitchItem({ name, team, viewerId, current, href }: { name: string; team: ShareTeam | null; viewerId: string; current: boolean; href: string }) {
  return (
    <DropdownMenuLinkItem render={<Link href={href} />} aria-current={current ? "page" : undefined} className="px-2 py-1.5 pointer-coarse:min-h-11">
      <TeamIcon team={team} viewerId={viewerId} size={24} />
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
