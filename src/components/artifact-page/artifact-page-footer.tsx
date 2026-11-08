import Link from "next/link";

import { LegalLinks } from "@/components/legal-links";
import { ThemeSwitcher } from "@/components/theme-switcher";

/**
 * The footer under an artifact: home, the legal links, and the light or dark
 * switch. Inside ArtifactPageTheme it takes the artifact theme's colors.
 */
export function ArtifactPageFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-[960px] flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/" className="transition-colors hover:text-foreground">artifacts.space</Link>
          <LegalLinks />
        </div>
        <ThemeSwitcher />
      </div>
    </footer>
  );
}
