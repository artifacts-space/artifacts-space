"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconChevronDown, IconExternalLink, IconInbox, IconKey, IconLogout, IconRestore } from "@tabler/icons-react";
import { useState } from "react";

import { useConfirmations } from "@/components/confirmations-provider";
import { GitHubLink } from "@/components/github-link";
import { Logo } from "@/components/logo";
import { PixelAvatar } from "@/components/pixel-avatar";
import { TeamSwitcher, type HeaderTeam } from "@/components/teams/team-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
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
        "relative flex h-full items-center gap-1.5 px-2 text-sm transition-colors sm:px-3",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <IconInbox className="size-4 sm:hidden" aria-hidden />
      <span className="hidden sm:inline">Inbox</span>
      {count > 0 ? (
        <span className="min-w-4.5 rounded-full bg-foreground px-1 text-center text-xs leading-4.5 font-medium text-background">{count > 49 ? "50+" : count}</span>
      ) : null}
      {active && <span className="absolute inset-x-2 bottom-0 h-px bg-foreground sm:inset-x-3" />}
    </Link>
  );
}

/** Brings back every confirmation the person turned off. Hidden when none are off. */
function ResetConfirmationsItem() {
  const { skipped, reset } = useConfirmations();
  if (skipped.size === 0) return null;
  return (
    <DropdownMenuItem onClick={() => void reset()} className="px-2 py-2">
      <IconRestore /> Reset confirmations
    </DropdownMenuItem>
  );
}

function NavLink({ href, label, active, className }: { href: string; label: string; active: boolean; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex h-full items-center px-2 text-sm transition-colors sm:px-3",
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
  /** Seeds the account chip's pixel avatar. */
  userId: string;
  name: string;
  email: string;
  username: string;
  teams: HeaderTeam[];
  unreadMentions: number;
}

export function AppHeader({ userId, name, email, username, teams, unreadMentions }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

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
        <div className="ml-auto flex items-center gap-1">
          <GitHubLink className="max-sm:hidden" />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" className="h-9 gap-2 px-1.5" disabled={signingOut} aria-label="Account menu" />}
            >
              <PixelAvatar seed={userId} size={28} />
              <IconChevronDown className="size-3 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Base UI requires a group label to sit inside a group. */}
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 py-2">
                  <span className="block truncate text-sm font-medium">{name}</span>
                  <span className="mt-0.5 block truncate font-mono text-xs font-normal text-muted-foreground">@{username}</span>
                  <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{email}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {/* Not a menu item: the switcher is its own radio group, so choosing keeps the menu open. */}
              <div className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
                <span aria-hidden="true">Theme</span>
                <ThemeSwitcher />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { router.push("/app/connections"); }} className="px-2 py-2">
                <IconKey /> Access tokens
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { router.push("/"); }} className="px-2 py-2">
                <IconExternalLink /> Public site
              </DropdownMenuItem>
              <ResetConfirmationsItem />
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()} className="px-2 py-2">
                <IconLogout /> {signingOut ? "Signing out…" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
