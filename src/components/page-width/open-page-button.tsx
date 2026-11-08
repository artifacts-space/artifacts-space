"use client";

import { IconExternalLink } from "@tabler/icons-react";

import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { artifactPageHref } from "@/lib/artifact-page-href";
import { cn } from "@/lib/utils";

interface OpenPageButtonProps {
  publicId: string;
  className?: string | undefined;
}

/**
 * "Open": the artifact's own page (the link Share and Copy link give out) in
 * a new tab, so the workspace keeps its place. It works for private
 * artifacts too, because the page lets their editors in. Icon only on
 * phones, where the toolbar is tight; the name stays for screen readers.
 * A plain link styled as a button, so it keeps the link role.
 */
export function OpenPageButton({ publicId, className }: OpenPageButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={artifactPageHref(publicId)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the artifact page in a new tab"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), className)}
          />
        }
      >
        <IconExternalLink aria-hidden /> <span className="max-sm:sr-only">Open</span>
      </TooltipTrigger>
      <TooltipContent>Open its page in a new tab</TooltipContent>
    </Tooltip>
  );
}
