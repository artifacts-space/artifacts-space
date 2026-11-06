"use client";

import { IconChevronDown, IconPlus, IconUser, IconUsers, IconUsersGroup } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** The fields of a team the header needs. */
export interface HeaderTeam {
  slug: string;
  name: string;
  personal: boolean;
}

/** Header menu: open a team's artifacts or its page, or create a team. */
export function TeamSwitcher({ teams, active }: { teams: HeaderTeam[]; active: boolean }) {
  const router = useRouter();
  const shared = teams.filter((team) => !team.personal);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "relative flex h-full items-center gap-1 px-2 text-sm outline-none transition-colors sm:px-3",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Teams
        <IconChevronDown className="size-3" />
        {active ? <span className="absolute inset-x-2 bottom-0 h-px bg-foreground sm:inset-x-3" /> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5 text-xs">Artifacts shared with</DropdownMenuLabel>
          {shared.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No shared teams yet.</p>
          ) : (
            shared.map((team) => (
              <DropdownMenuItem key={team.slug} onClick={() => { router.push(`/app?team=${encodeURIComponent(team.slug)}`); }} className="px-2 py-2">
                <IconUsersGroup /> <span className="truncate">{team.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { router.push("/app"); }} className="px-2 py-2">
          <IconUser /> My artifacts
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { router.push("/teams"); }} className="px-2 py-2">
          <IconUsers /> Manage teams
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { router.push("/teams/new"); }} className="px-2 py-2">
          <IconPlus /> Create a team
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
