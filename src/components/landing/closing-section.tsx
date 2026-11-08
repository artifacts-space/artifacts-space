import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

/** The last call to action: copy first, buttons below it. */
export function ClosingSection() {
  return (
    <section className="border-t py-24 sm:py-32" aria-labelledby="closing-heading">
      <h2 id="closing-heading" className="max-w-[760px] text-balance text-[clamp(2rem,4vw,3.25rem)] font-medium leading-[1.05] tracking-[-0.03em]">
        Keep up with your agents.
      </h2>
      <p className="mt-5 max-w-[560px] text-base leading-7 text-muted-foreground">
        Sign in with GitHub or email. Connect one agent, and read its next plan on a real page.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button render={<Link href="/sign-up" />} nativeButton={false} className="h-10 px-4 text-sm">
          Get started <IconArrowRight data-icon="inline-end" />
        </Button>
        <Button render={<Link href="/docs" />} nativeButton={false} variant="outline" className="h-10 px-4 text-sm">
          Read the docs
        </Button>
      </div>
    </section>
  );
}
