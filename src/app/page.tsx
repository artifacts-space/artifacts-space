import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

import { GitHubLink } from "@/components/github-link";
import { ClosingSection } from "@/components/landing/closing-section";
import { SurfaceSection } from "@/components/landing/surface-section";
import { ConnectSection } from "@/components/landing/connect-section";
import { ControlSection } from "@/components/landing/control-section";
import { HeroDemo } from "@/components/landing/demo/hero-demo";
import { HowSection } from "@/components/landing/how-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { WhySection } from "@/components/landing/why-section";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { docsHref } from "@/lib/docs/pages";

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-4 px-6 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <Logo className="justify-self-start" />
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
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-6">
        <section className="pb-14 pt-20 sm:pb-16 sm:pt-28">
          <h1 className="animate-enter max-w-[920px] text-balance text-[clamp(2.5rem,5.5vw,4.75rem)] font-medium leading-[1.02] tracking-[-0.035em]">
            The collaboration space for humans and agents.
          </h1>
          <p className="animate-enter mt-6 max-w-[640px] text-lg leading-8 text-muted-foreground" style={{ animationDelay: "60ms" }}>
            Artifacts are the shared surface where you, your team, and your agents work together. They hold your plans, decisions, research, and reviews. Switch between Claude and Codex, and you keep every artifact.
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
            Works with Claude Code, Codex, Cursor, OpenCode, Kimi Code, Claude Desktop, Devin, and any MCP client.
          </p>
        </section>

        <HeroDemo />
        <HowSection />
        <SurfaceSection />
        <WhySection />
        <ConnectSection />
        <ControlSection />
        <PricingSection />
        <ClosingSection />
      </main>

      <SiteFooter />
    </div>
  );
}
