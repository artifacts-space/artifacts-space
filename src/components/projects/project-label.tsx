import { IconFolder } from "@tabler/icons-react";

import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
import { cn } from "@/lib/utils";

/** A project's icon, or a folder when it has none. Decorative: the name beside it says which project. */
export function ProjectIcon({ icon, className }: { icon: string | null; className?: string }) {
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
