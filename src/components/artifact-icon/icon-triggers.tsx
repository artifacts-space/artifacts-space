import { IconMoodSmile } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

import { ArtifactIcon, type ArtifactIconSize } from "./artifact-icon";

/**
 * The quiet "Add icon" button above a title. It shows when the title area
 * (a `group/title` parent) is hovered, when it has focus, while its picker
 * is open, and always on touch screens. Use it as IconPicker's trigger.
 */
export const addIconTrigger = (
  <button
    type="button"
    className="-ml-2 inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[popup-open]:opacity-100 pointer-coarse:opacity-100"
  >
    <IconMoodSmile aria-hidden className="size-4" /> Add icon
  </button>
);

/** The set icon as a button that reopens the picker to change or remove it. */
export function changeIconTrigger(icon: string, size: ArtifactIconSize, busy = false) {
  return (
    <button
      type="button"
      aria-label="Change icon"
      title="Change icon"
      className={cn("-ml-1.5 inline-flex rounded-lg p-1.5 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", busy && "opacity-60")}
    >
      <ArtifactIcon icon={icon} size={size} />
    </button>
  );
}
