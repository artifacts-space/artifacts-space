import { CopyButton } from "@/components/copy-button";
import { GitHubLink } from "@/components/github-link";
import { Logo } from "@/components/logo";
import type { ArtifactVisibility } from "@/lib/artifact-types";

import { VisibilityBadge } from "./visibility-badge";

/**
 * The artifact page's top bar: the logo, who can see the artifact, the
 * source link, and Copy. Its colors come from the tokens around it, so the
 * page wraps it in ArtifactPageTheme to give it the artifact theme's colors.
 */
export function ArtifactHeader({ visibility, sentence, content }: { visibility: ArtifactVisibility; sentence: string; content: string }) {
  return (
    <div className="border-b">
      <header className="mx-auto flex h-14 w-full max-w-[960px] items-center justify-between gap-3 px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <VisibilityBadge visibility={visibility} sentence={sentence} iconOnlyOnPhones />
          <GitHubLink />
          <CopyButton value={content} label="Copy" variant="outline" size="sm" />
        </div>
      </header>
    </div>
  );
}
