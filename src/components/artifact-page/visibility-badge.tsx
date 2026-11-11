"use client";

import { IconEye, IconEyeOff, IconLink, IconUsers, type Icon } from "@tabler/icons-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ArtifactVisibility } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";
import { visibilityCopy } from "@/lib/visibility-copy";

/** Each level's icon in the artifact page's header, for the read-only status and the sharer's Share button alike. */
export const visibilityIcons: Record<ArtifactVisibility, Icon> = { private: IconEyeOff, team: IconUsers, link: IconLink, public: IconEye };

/** The header status's look, shared with the sharer's Share button so the header keeps its size. */
export const visibilityStatusClass =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Who can see an artifact, as an icon and a short label ("Private",
 * "Team", "Link", "Public"). The full sentence ("Private. Only you can see
 * this.") is its tooltip and accessible name. With `iconOnlyOnPhones`, the
 * label is kept for screen readers but hidden below the sm breakpoint so the
 * artifact page's header fits a phone.
 */
export function VisibilityBadge({
  visibility,
  sentence,
  iconOnlyOnPhones = false,
  className,
}: {
  visibility: ArtifactVisibility;
  sentence: string;
  iconOnlyOnPhones?: boolean;
  className?: string;
}) {
  const VisibilityIcon = visibilityIcons[visibility];
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" />}
        aria-label={sentence}
        data-visibility={visibility}
        className={cn(visibilityStatusClass, className)}
      >
        <VisibilityIcon aria-hidden className="size-4 shrink-0" />
        <span className={cn(iconOnlyOnPhones && "max-sm:sr-only")}>{visibilityCopy(visibility).label}</span>
      </TooltipTrigger>
      <TooltipContent>{sentence}</TooltipContent>
    </Tooltip>
  );
}
