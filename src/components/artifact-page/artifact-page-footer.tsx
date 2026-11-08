import Link from "next/link";

import { LegalLinks } from "@/components/legal-links";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { pageColumnClass } from "@/lib/page-width/rules";
import { cn } from "@/lib/utils";

/**
 * The footer under an artifact: home, the legal links, and the light or dark
 * switch. Inside ArtifactPageTheme it takes the artifact theme's colors.
 * `column` is the page column's classes (pageColumnClass).
 */
export function ArtifactPageFooter({ column = pageColumnClass(false) }: { column?: string }) {
  return (
    <footer className="border-t">
      <div className={cn("mx-auto flex w-full flex-wrap items-center justify-between gap-4 py-6 text-sm text-muted-foreground", column)}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/" className="transition-colors hover:text-foreground">artifacts.space</Link>
          <LegalLinks />
        </div>
        <ThemeSwitcher />
      </div>
    </footer>
  );
}
