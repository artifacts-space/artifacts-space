import { IconRobot } from "@tabler/icons-react";
import type { CSSProperties } from "react";

import { harnessFor, harnesses, type HarnessId } from "@/lib/harness/harnesses";
import { cn } from "@/lib/utils";

/**
 * Each harness icon as a CSS mask over the text color, built once. The marks
 * in public/agent-icons are single-color, so they take the theme's
 * foreground in light and dark mode and never carry a color of their own.
 */
const maskStyles = new Map<string, CSSProperties>(
  harnesses.flatMap((harness) => {
    if (!harness.icon) return [];
    const mask = `url(${harness.icon}) center / contain no-repeat`;
    return [[harness.id, { mask, WebkitMask: mask }]];
  }),
);

interface HarnessIconProps {
  id: HarnessId;
  className?: string | undefined;
}

/** A harness's mark, or a robot for "Other agent". Decorative: say the name in text or an aria-label beside it. */
export function HarnessIcon({ id, className }: HarnessIconProps) {
  const style = maskStyles.get(harnessFor(id).id);
  if (!style) return <IconRobot aria-hidden data-harness-icon="other" className={cn("size-3.5 shrink-0", className)} />;
  return <span aria-hidden data-harness-icon={id} className={cn("inline-block size-3.5 shrink-0 bg-current", className)} style={style} />;
}
