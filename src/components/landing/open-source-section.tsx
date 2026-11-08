import Link from "next/link";
import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { docsHref } from "@/lib/docs/pages";
import { REPO_URL } from "@/lib/site-copy";

import { Galaxy } from "./galaxy";
import { SectionEyebrow } from "./section-marks";

/**
 * The page's last call to action: open source, MIT licensed. Copy and buttons
 * on the left; on the right, an animated pixel galaxy: artifacts orbiting
 * the brand planet (galaxy.tsx), on its own night sky in both themes.
 */
export function OpenSourceSection() {
  return (
    <section id="open-source" className="scroll-mt-20 border-t py-24 sm:py-32" aria-labelledby="open-source-heading">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0">
          <SectionEyebrow>open source</SectionEyebrow>
          <h2 id="open-source-heading" className="max-w-[560px] text-balance text-[clamp(2rem,4vw,3.25rem)] font-medium leading-[1.05] tracking-[-0.03em]">
            Open source from day one.
          </h2>
          <p className="mt-5 max-w-[560px] text-base leading-7 text-muted-foreground">
            artifacts.space is MIT licensed. Read the code, change it, and run it on your own Postgres. Your artifacts never get locked inside one company, including ours.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button render={<Link href="/sign-up" />} nativeButton={false} className="h-10 px-4 text-sm">
              Get started <IconArrowRight data-icon="inline-end" />
            </Button>
            <Button render={<a href={REPO_URL} target="_blank" rel="noopener noreferrer" />} nativeButton={false} variant="outline" className="h-10 px-4 text-sm">
              <IconBrandGithub data-icon="inline-start" /> View on GitHub
            </Button>
          </div>
          <Link href={docsHref("self-hosting")} className="mt-5 inline-block text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground">
            Host it yourself
          </Link>
        </div>
        <div className="card-surface overflow-hidden">
          <Galaxy />
        </div>
      </div>
    </section>
  );
}
