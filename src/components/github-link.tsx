import { IconBrandGithub } from "@tabler/icons-react";

import { REPO_URL } from "@/lib/site-copy";
import { cn } from "@/lib/utils";

/** An icon link to the source repository on GitHub, sized for the site headers. */
export function GitHubLink({ className }: { className?: string }) {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="artifacts.space on GitHub"
      title="View source on GitHub"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <IconBrandGithub className="size-5" aria-hidden />
    </a>
  );
}
