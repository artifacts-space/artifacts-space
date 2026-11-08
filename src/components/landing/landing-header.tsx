import Link from "next/link";

import { GitHubLink } from "@/components/github-link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

import "./landing-header.css";

/**
 * The landing page's top bar. It stays pinned while the page scrolls (h-14,
 * 3.5rem; the How it works stage pins below it in how.css), and its logo's
 * ring turns with the scroll.
 */
export function LandingHeader() {
  return (
    <header className="landing-header sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-4 px-6 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <Logo spin className="justify-self-start" />
        <nav className="flex items-center gap-6 text-sm font-medium text-muted-foreground" aria-label="Main navigation">
          <a href="#how" className="hidden transition-colors hover:text-foreground sm:inline">How it works</a>
          <a href="#connect" className="hidden transition-colors hover:text-foreground lg:inline">Connect</a>
          <a href="#pricing" className="hidden transition-colors hover:text-foreground md:inline">Pricing</a>
          <Link href="/docs" className="hidden transition-colors hover:text-foreground sm:inline">Docs</Link>
        </nav>
        <div className="flex items-center gap-6 justify-self-end text-sm font-medium text-muted-foreground">
          <GitHubLink className="-mx-2" />
          <Link href="/sign-in" className="transition-colors hover:text-foreground">Sign in</Link>
          <Button render={<Link href="/sign-up" />} nativeButton={false} size="sm" className="hidden px-3 sm:inline-flex">
            Get started
          </Button>
        </div>
      </div>
    </header>
  );
}
