import { IconDownload } from "@tabler/icons-react";

import { CopyButton } from "@/components/copy-button";
import { GitHubLink } from "@/components/github-link";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import type { ArtifactVisibility } from "@/lib/artifact-types";
import { pageColumnClass } from "@/lib/page-width/rules";
import { cn } from "@/lib/utils";

import { VisibilityBadge } from "./visibility-badge";

/**
 * The artifact page's top bar: the logo, who can see the artifact, the
 * source link, Download CSV and Copy when this reader may take the data
 * out (`download`, `content`), and for editors `menu` (the save status and the "⋯"
 * menu, ArtifactHeaderMenu). Its colors come from the tokens around it, so the
 * page wraps it in ArtifactPageTheme to give it the artifact theme's colors.
 * `column` is the page column's classes (pageColumnClass), so the row lines
 * up with the artifact at either page width.
 */
export function ArtifactHeader({
  visibility,
  sentence,
  content,
  download = null,
  column = pageColumnClass(false),
  menu = null,
}: {
  visibility: ArtifactVisibility;
  sentence: string;
  /** What Copy copies; null hides Copy, for a CSV whose owner turned downloads off. */
  content: string | null;
  /** The raw CSV and its file name, for Download CSV; null for none. */
  download?: { href: string; filename: string } | null;
  column?: string;
  menu?: React.ReactNode;
}) {
  return (
    <div className="border-b">
      <header className={cn("mx-auto flex h-14 w-full items-center justify-between gap-3", column)}>
        <Logo />
        <div className="flex min-w-0 items-center gap-2">
          <VisibilityBadge visibility={visibility} sentence={sentence} iconOnlyOnPhones />
          <GitHubLink />
          {download ? (
            <a href={download.href} download={download.filename} aria-label="Download CSV" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <IconDownload aria-hidden /> <span className="hidden sm:inline">Download CSV</span>
            </a>
          ) : null}
          {content === null ? null : <CopyButton value={content} label="Copy" variant="outline" size="sm" />}
          {menu}
        </div>
      </header>
    </div>
  );
}
