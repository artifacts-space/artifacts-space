import { IconFolder } from "@tabler/icons-react";

import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
import { projectNameKey } from "@/lib/projects/rules";
import { projectDotIndex } from "@/lib/projects/sidebar-view-rules";
import { cn } from "@/lib/utils";

/** A project's icon, or a folder when it has none. Decorative: the name beside it says which project. */
export function ProjectIcon({ icon, className }: { icon: string | null; className?: string | undefined }) {
  if (!icon) return <IconFolder aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground", className)} />;
  return <ArtifactIcon icon={icon} className={cn("size-3.5 text-xs", className)} />;
}

/** A project's icon and name on one line, truncated. */
export function ProjectLabel({ name, icon, className }: { name: string; icon: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <ProjectIcon icon={icon} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** The `--series-*` dot colours, spelled out so Tailwind keeps every class. */
const dotColors = ["bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4", "bg-series-5", "bg-series-6", "bg-series-7", "bg-series-8"] as const;

/**
 * A project's mark in the sidebar and the breadcrumb: its icon when it has
 * one, else a small dot in a colour that follows its name. `null` is
 * Unfiled, a neutral dot. Decorative: the name beside it says which project.
 */
export function ProjectMark({ name, icon, className }: { name: string | null; icon: string | null; className?: string }) {
  if (icon) return <ProjectIcon icon={icon} className={className} />;
  const color = name === null ? "bg-muted-foreground/60" : (dotColors[projectDotIndex(projectNameKey(name)) - 1] ?? dotColors[0]);
  return (
    <span aria-hidden className={cn("inline-flex size-3.5 shrink-0 items-center justify-center", className)}>
      <span className={cn("size-2 rounded-full", color)} />
    </span>
  );
}
