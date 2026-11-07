import Link from "next/link";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { formatKinds } from "@/lib/artifact-formats";
import { formatBytes } from "@/lib/files/config";
import { storageQuota } from "@/lib/quota/rules";

/** "1.0 GB" reads better as "1 GB" in marketing copy. */
const quotaSize = (bytes: number) => formatBytes(bytes).replace(".0 ", " ");

const included = [
  `Save in all ${String(formatKinds.length)} formats: Markdown, code, text, JSON, CSV, diagrams, interfaces, and files.`,
  "Connect any agent: Claude, Codex, Cursor, Devin, or any MCP client.",
  "Share with your team. Approve what your agents ask to share.",
  "Comment on every artifact.",
  "Restore any saved version from the history.",
  `Keep ${quotaSize(storageQuota.contentBytes)} of artifact content and ${quotaSize(storageQuota.fileBytes)} of files on each account.`,
] as const;

/** The one plan: free, with what it includes, then a single call to action below the copy. */
export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-20 border-t py-20 sm:py-24" aria-labelledby="pricing-heading">
      <h2 id="pricing-heading" className="text-balance text-3xl font-medium tracking-[-0.025em] sm:text-4xl">
        Pricing
      </h2>
      <div className="card-surface mt-10 max-w-[560px] p-6 sm:p-8">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-lg font-medium">Free</h3>
          <p className="text-3xl font-medium tracking-[-0.025em]">$0</p>
        </div>
        <p className="mt-4 text-base leading-7">Free forever for everyone who signs up now.</p>
        <p className="mt-1 text-md leading-6 text-muted-foreground">
          Make your account now. It stays free, even if we add paid plans later.
        </p>
        <ul className="mt-6 grid gap-3 border-t pt-6">
          {included.map((item) => (
            <li key={item} className="flex gap-3 text-md leading-6">
              <IconCheck aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
        <Button render={<Link href="/sign-up" />} nativeButton={false} className="mt-8 h-10 px-4 text-sm">
          Get started <IconArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </section>
  );
}
