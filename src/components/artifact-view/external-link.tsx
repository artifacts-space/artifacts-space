import { IconArrowUpRight } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { externalLinkRel, safeHref } from "@/lib/link-policy";
import { cn } from "@/lib/utils";

/**
 * A link from artifact content. Only http, https, and mailto URLs become
 * links; anything else renders as plain text. Links open in a new tab with
 * rel="noopener noreferrer nofollow ugc" and show an external-link mark.
 */
export function ExternalLink({ href, children, className }: { href: unknown; children: ReactNode; className?: string }) {
  const safe = safeHref(href);
  if (!safe) return <span className={className}>{children}</span>;
  return (
    <a
      href={safe}
      target="_blank"
      rel={externalLinkRel}
      className={cn("underline decoration-border underline-offset-[3px] transition-colors hover:decoration-foreground focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", className)}
    >
      {children}
      <IconArrowUpRight aria-hidden className="ml-0.5 inline size-[0.85em] -translate-y-px align-baseline text-muted-foreground" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
