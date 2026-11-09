import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

import { SurfaceSection } from "@/components/landing/surface-section";
import { ConnectSection } from "@/components/landing/connect-section";
import { ControlSection } from "@/components/landing/control-section";
import { HeroDemo } from "@/components/landing/demo/hero-demo";
import { HowSection } from "@/components/landing/how-section";
import { LandingHeader } from "@/components/landing/landing-header";
import { OpenSourceSection } from "@/components/landing/open-source-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { WhySection } from "@/components/landing/why-section";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { docsHref } from "@/lib/docs/pages";

export default function Home() {
  return (
    <div className="min-h-screen">
      <LandingHeader />

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
            Works with Claude Code, Codex, Cursor, OpenCode, Kimi Code, Claude Desktop, Devin, fx, and any MCP client.
          </p>
        </section>

        <HeroDemo />
        <HowSection />
        <SurfaceSection />
        <WhySection />
        <ConnectSection />
        <ControlSection />
        <PricingSection />
        <OpenSourceSection />
      </main>

      <SiteFooter />
    </div>
  );
}
