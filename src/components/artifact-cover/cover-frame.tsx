import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * The banner's height: 160px on phones, 240px from the sm breakpoint. A page
 * icon sits across its lower edge (the artifact page's HeadingIcon). Fixed,
 * so nothing below moves while an image loads. Link previews size their own
 * cover band (src/lib/og).
 */
export const COVER_HEIGHT_CLASS = "h-40 sm:h-60";

/**
 * The full-bleed box a cover fills. Its height never depends on the
 * picture, so a cover image loading (or failing) shifts nothing.
 */
export function CoverFrame({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div {...rest} data-artifact-cover="" className={cn("group/cover relative w-full overflow-hidden", COVER_HEIGHT_CLASS, className)}>
      {children}
    </div>
  );
}
