"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconChevronDown, IconExternalLink, IconInbox, IconKey, IconLogout, IconUser } from "@tabler/icons-react";
import { useState } from "react";

import { Logo } from "@/components/logo";
import { TeamSwitcher, type HeaderTeam } from "@/components/teams/team-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

const artifactsLink = { href: "/app", label: "Artifacts" };
const connectionsLink = { href: "/app/connections", label: "Connections" };

/** The inbox link, with the number of unread mentions. */
function InboxLink({ count, active }: { count: number; active: boolean }) {
  const label = count > 0 ? `Inbox, ${String(count)} unread` : "Inbox";
  return (
    <Link
      href="/inbox"
      aria-label={label}
      className={cn(
        "relative flex h-full items-center gap-1.5 px-2 text-[13px] transition-colors sm:px-3",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <IconInbox className="size-4 sm:hidden" aria-hidden />
      <span className="hidden sm:inline">Inbox</span>
      {count > 0 ? (
        <span className="min-w-4 rounded-full bg-foreground px-1 text-center text-[10px] leading-4 font-medium text-background">{count > 49 ? "50+" : count}</span>
      ) : null}
      {active && <span className="absolute inset-x-2 bottom-0 h-px bg-foreground sm:inset-x-3" />}
    </Link>
  );
}

function NavLink({ href, label, active, className }: { href: string; label: string; active: boolean; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex h-full items-center px-2 text-[13px] transition-colors sm:px-3",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {label}
      {active && <span className="absolute inset-x-2 bottom-0 h-px bg-foreground sm:inset-x-3" />}
    </Link>
  );
}

interface AppHeaderProps {
  name: string;
  email: string;
  username: string;
  teams: HeaderTeam[];
  unreadMentions: number;
}

export function AppHeader({ name, email, username, teams, unreadMentions }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-none items-center gap-3 px-4 sm:gap-8 sm:px-6">
        <span className="sm:hidden"><Logo href="/app" compact /></span>
        <span className="hidden sm:inline"><Logo href="/app" /></span>
        <nav className="flex h-full items-center gap-1" aria-label="Workspace navigation">
          <NavLink {...artifactsLink} active={pathname === artifactsLink.href} />
          <TeamSwitcher teams={teams} active={pathname.startsWith("/teams")} />
          <InboxLink count={unreadMentions} active={pathname.startsWith("/inbox") || pathname.startsWith("/threads")} />
          {/* On phones, Connections lives in the account menu ("Access tokens"). */}
          <NavLink {...connectionsLink} active={pathname.startsWith(connectionsLink.href)} className="max-sm:hidden" />
        </nav>
        <div className="ml-auto flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" className="h-9 gap-2 px-1.5" disabled={signingOut} />}
            >
              <span className="flex size-7 items-center justify-center rounded-sm border bg-card text-[11px] font-medium">
                {initials || <IconUser className="size-3.5" />}
              </span>
              <IconChevronDown className="size-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Base UI requires a group label to sit inside a group. */}
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 py-2">
                  <span className="block truncate text-xs font-medium">{name}</span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] font-normal text-muted-foreground">@{username}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">{email}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { router.push("/app/connections"); }} className="px-2 py-2 text-xs">
                <IconKey /> Access tokens
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { router.push("/"); }} className="px-2 py-2 text-xs">
                <IconExternalLink /> Public site
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()} className="px-2 py-2 text-xs">
                <IconLogout /> {signingOut ? "Signing out…" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
