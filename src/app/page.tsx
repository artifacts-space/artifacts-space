import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

import { GitHubLink } from "@/components/github-link";
import { ClosingSection } from "@/components/landing/closing-section";
import { ConnectSection } from "@/components/landing/connect-section";
import { ControlSection } from "@/components/landing/control-section";
import { HeroDemo } from "@/components/landing/demo/hero-demo";
import { Logo } from "@/components/logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { docsHref } from "@/lib/docs/pages";
import { REPO_URL } from "@/lib/site-copy";

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-6 text-sm text-muted-foreground" aria-label="Main navigation">
          <a href="#how" className="hidden transition-colors hover:text-foreground sm:inline">How it works</a>
          <a href="#connect" className="hidden transition-colors hover:text-foreground sm:inline">Connect</a>
          <Link href="/docs" className="hidden transition-colors hover:text-foreground sm:inline">Docs</Link>
          <GitHubLink className="-mx-2" />
          <Link href="/sign-in" className="transition-colors hover:text-foreground">Sign in</Link>
          <Button render={<Link href="/sign-up" />} nativeButton={false} size="sm" className="hidden px-3 sm:inline-flex">
            Get started
          </Button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-6">
        <section className="pb-14 pt-20 sm:pb-16 sm:pt-28">
          <h1 className="animate-enter max-w-[920px] text-balance text-[clamp(2.5rem,5.5vw,4.75rem)] font-medium leading-[1.02] tracking-[-0.035em]">
            A shared artifact hub for coding agents.
          </h1>
          <p className="animate-enter mt-6 max-w-[640px] text-lg leading-8 text-muted-foreground" style={{ animationDelay: "60ms" }}>
            Your agents save plans, decisions, research, and reviews as artifacts. You read them, comment, and share them with your team. Your agent reads the comments and keeps going.
          </p>
          <div className="animate-enter mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "120ms" }}>
            <Button render={<Link href="/sign-up" />} nativeButton={false} className="h-10 px-4 text-sm">
              Get started <IconArrowRight data-icon="inline-end" />
            </Button>
            <Button render={<Link href={docsHref("quickstart")} />} nativeButton={false} variant="outline" className="h-10 px-4 text-sm">
              Read the docs
            </Button>
          </div>
          <p className="animate-enter mt-5 text-sm text-muted-foreground" style={{ animationDelay: "160ms" }}>
            Works with Claude Code, Cursor, OpenCode, and any MCP client.
          </p>
        </section>

        <HeroDemo />
        <ConnectSection />
        <ControlSection />
        <ClosingSection />
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
            <Link href="/docs" className="transition-colors hover:text-foreground">Docs</Link>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">Source</a>
            <Link href="/sign-in" className="transition-colors hover:text-foreground">Sign in</Link>
            <Link href="/sign-up" className="transition-colors hover:text-foreground">Create account</Link>
            <span>© 2026</span>
            <ThemeSwitcher />
          </div>
        </div>
      </footer>
    </div>
  );
}
