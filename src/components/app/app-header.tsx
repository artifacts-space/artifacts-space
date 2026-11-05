"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, LogOut, PlugZap, UserRound } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function AppHeader({
  user,
}: {
  user: { name: string; email: string; image?: string | null };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const initials = user.name
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
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#111216]/90 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-3 sm:gap-8 sm:px-6">
        <span className="sm:hidden"><Logo href="/app" compact /></span>
        <span className="hidden sm:inline"><Logo href="/app" /></span>
        <nav className="flex h-full items-center gap-0 sm:gap-1" aria-label="Workspace navigation">
          {[
            { href: "/app", label: "Artifacts", exact: true },
            { href: "/app/connections", label: "Connections", exact: false },
          ].map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex h-full items-center px-2 text-[11px] transition-colors sm:px-3 sm:text-[12px]",
                  active ? "text-white" : "text-white/40 hover:text-white/75",
                )}
              >
                {item.label}
                {active && <span className="absolute inset-x-3 bottom-0 h-px bg-[#4d8dff]" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 font-mono text-[9px] tracking-[0.1em] text-white/30 md:flex">
            <span className="size-1.5 animate-signal rounded-full bg-[#4d8dff]" />
            MCP READY
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" className="h-9 gap-2 px-1.5" disabled={signingOut} />
              }
            >
              <span className="flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.05] text-[10px] font-medium text-white/70">
                {initials || <UserRound className="size-3.5" />}
              </span>
              <ChevronDown className="size-3 text-white/35" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-white/10 bg-[#191a1f]">
              <DropdownMenuLabel className="px-2 py-2">
                <span className="block truncate text-xs font-medium text-white/80">{user.name}</span>
                <span className="mt-1 block truncate text-[10px] font-normal text-white/35">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/app/connections")} className="px-2 py-2 text-xs">
                <PlugZap /> Manage MCP tokens
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/")} className="px-2 py-2 text-xs">
                <ExternalLink /> Public site
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="px-2 py-2 text-xs">
                <LogOut /> {signingOut ? "Signing out…" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
