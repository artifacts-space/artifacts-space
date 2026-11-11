"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconBook, IconExternalLink, IconInbox, IconKey, IconLogout, IconMessageReport, IconRestore, IconSettings, IconUsers } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";

import { useConfirmations } from "@/components/confirmations-provider";
import { FeedbackDialog, type FeedbackSend } from "@/components/feedback/feedback-dialog";
import { GitHubLink } from "@/components/github-link";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { forgetThisBrowser } from "@/components/notifications/push/forget-this-browser";
import { PixelAvatar } from "@/components/pixel-avatar";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/client";
import { landingPageFlag } from "@/lib/auth/entry-rules";
import type { NotificationView } from "@/lib/notifications/feed";
import { cn } from "@/lib/utils";

const artifactsLink = { href: "/app", label: "Artifacts" };
const landingPageHref = `/?${landingPageFlag}`;
const connectionsLink = { href: "/app/connections", label: "Connections" };

/** A header tab: the open one is a filled pill. */
const tabClass = "flex h-8 items-center rounded-lg px-2.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:px-3";
const activeTab = "bg-muted font-medium text-foreground";
const idleTab = "text-muted-foreground hover:bg-muted/60 hover:text-foreground";

/** The inbox link: every mention with its thread. The bell carries the unread count. */
function InboxLink({ active }: { active: boolean }) {
  return (
    <Link
      href="/inbox"
      aria-label="Inbox"
      aria-current={active ? "page" : undefined}
      className={cn(tabClass, "gap-1.5", active ? activeTab : idleTab)}
    >
      <IconInbox className="size-4 sm:hidden" aria-hidden />
      <span className="hidden sm:inline">Inbox</span>
    </Link>
  );
}

/** A link in the account menu, marked as the current page while its section is open. */
function AccountLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <DropdownMenuLinkItem render={<Link href={href} />} aria-current={active ? "page" : undefined} className={cn("px-2 py-2", active && "bg-muted font-medium")}>
      {children}
    </DropdownMenuLinkItem>
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
    <Link href={href} aria-current={active ? "page" : undefined} className={cn(tabClass, active ? activeTab : idleTab, className)}>
      {label}
    </Link>
  );
}

interface AppHeaderProps {
  /** Seeds the account chip's pixel avatar. */
  userId: string;
  name: string;
  email: string;
  username: string;
  /** Unread notifications for the bell. */
  unreadNotifications: number;
  /** A bell list without a database, for the dev fixture only. */
  notificationSeed?: NotificationView[];
  /** A stand-in for sending "Something's not working" reports, for the dev fixture only. */
  feedbackSend?: FeedbackSend;
}

export function AppHeader({ userId, name, email, username, unreadNotifications, notificationSeed, feedbackSend }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  async function signOut() {
    setSigningOut(true);
    // A shared computer should not keep showing this account's notifications.
    await forgetThisBrowser();
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-none items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <span className="sm:hidden"><Logo href="/app" compact /></span>
        <span className="hidden sm:inline"><Logo href="/app" /></span>
        {/* Teams live in the sidebar's workspace switcher and the account menu. */}
        <nav className="flex h-full items-center gap-1" aria-label="Workspace navigation">
          <NavLink {...artifactsLink} active={pathname === artifactsLink.href} />
          <InboxLink active={pathname.startsWith("/inbox") || pathname.startsWith("/threads")} />
          {/* On phones, Connections lives in the account menu ("Access tokens"). */}
          <NavLink {...connectionsLink} active={pathname.startsWith(connectionsLink.href)} className="max-sm:hidden" />
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <GitHubLink className="max-sm:hidden" />
          <NotificationBell initialUnread={unreadNotifications} {...(notificationSeed ? { seed: notificationSeed } : {})} />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" className="size-9 rounded-full p-0" disabled={signingOut} aria-label="Account menu" />}
            >
              <PixelAvatar seed={userId} size={28} />
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
              <AccountLink href="/app/settings" active={pathname.startsWith("/app/settings")}>
                <IconSettings /> Settings
              </AccountLink>
              <AccountLink href="/teams" active={pathname.startsWith("/teams")}>
                <IconUsers /> Teams
              </AccountLink>
              <AccountLink href="/app/connections" active={pathname.startsWith("/app/connections")}>
                <IconKey /> Access tokens
              </AccountLink>
              <AccountLink href="/docs" active={false}>
                <IconBook /> Docs
              </AccountLink>
              {/* Opens a dialog outside the menu, so the menu can close first. */}
              <DropdownMenuItem onClick={() => { setFeedbackOpen(true); }} className="px-2 py-2">
                <IconMessageReport /> Something&apos;s not working
              </DropdownMenuItem>
              {/* `/?home` shows the landing page; a plain `/` sends signed-in people back here. */}
              <AccountLink href={landingPageHref} active={false}>
                <IconExternalLink /> Public site
              </AccountLink>
              <ResetConfirmationsItem />
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()} className="px-2 py-2">
                <IconLogout /> {signingOut ? "Signing out…" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} {...(feedbackSend ? { send: feedbackSend } : {})} />
        </div>
      </div>
    </header>
  );
}
