"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * An icon-only button with an accessible name and a matching tooltip. The
 * tooltip stays open on click so it can confirm what happened, such as
 * "Copied".
 */
export function IconButton({
  label,
  tooltip = label,
  onClick,
  pressed,
  className,
  children,
}: {
  label: string;
  tooltip?: string;
  onClick: () => void;
  pressed?: boolean | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={pressed}
            className={cn("text-muted-foreground hover:text-foreground", className)}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
