import { PixelAvatar } from "@/components/pixel-avatar";
import { kindColors, kindIcons } from "@/lib/artifact-kinds";
import { demoPeople, demoTitle, T } from "@/lib/landing/demo-story";
import { cn } from "@/lib/utils";

import { beat } from "./beat";

/** The format the agent saves: a web page. */
const savedKind = "html";
const SavedIcon = kindIcons[savedKind];

/**
 * What travels between the two windows. The artifact card flies from the
 * terminal's tool call to the browser's list as artifacts_create lands, and
 * Dana's reply flies from the thread back to the terminal as inbox_list reads
 * it. demo.css sets each path (`--fly-x`, `--fly-y`); both show on wide
 * screens only, and never in the finished state.
 */
export function DemoHandoff() {
  return (
    <>
      <div className="demo-packet demo-packet--out theme-invert" style={beat(T.handoff)}>
        <SavedIcon aria-hidden className={cn("size-4 shrink-0", kindColors[savedKind])} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{demoTitle}</span>
          <span className="block truncate text-xs text-muted-foreground">{savedKind} · {demoPeople.project}</span>
        </span>
      </div>
      <div className="demo-packet demo-packet--back theme-invert" style={beat(T.handback)}>
        <PixelAvatar seed={demoPeople.reviewer.seed} size={20} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">@{demoPeople.reviewer.handle}</span>
          <span className="block truncate text-xs text-muted-foreground">Hold at 5% over the weekend.</span>
        </span>
      </div>
    </>
  );
}
