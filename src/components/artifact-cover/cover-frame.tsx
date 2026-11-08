import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** The banner's height: slim on phones, a little taller from the sm breakpoint. Fixed, so nothing below moves while an image loads. */
export const COVER_HEIGHT_CLASS = "h-30 sm:h-45";

/**
 * The slim, full-bleed box a cover fills. Its height never depends on the
 * picture, so a cover image loading (or failing) shifts nothing.
 */
export function CoverFrame({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div {...rest} data-artifact-cover="" className={cn("group/cover relative w-full overflow-hidden", COVER_HEIGHT_CLASS, className)}>
      {children}
    </div>
  );
}
