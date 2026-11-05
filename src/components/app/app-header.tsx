"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconChevronDown, IconExternalLink, IconKey, IconLogout, IconUser } from "@tabler/icons-react";
import { useState } from "react";

import { Logo } from "@/components/logo";
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

const navigation = [
  { href: "/app", label: "Artifacts", exact: true },
  { href: "/app/connections", label: "Connections", exact: false },
];

export function AppHeader({ name, email }: { name: string; email: string }) {
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
          {navigation.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex h-full items-center px-2 text-[13px] transition-colors sm:px-3",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                {active && <span className="absolute inset-x-2 bottom-0 h-px bg-foreground sm:inset-x-3" />}
              </Link>
            );
          })}
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
