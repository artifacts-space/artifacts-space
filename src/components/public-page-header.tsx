import Link from "next/link";

import { Logo } from "@/components/logo";
import { legalPaths } from "@/lib/legal/contact";

const linkClass = "transition-colors hover:text-foreground";

/**
 * The header of the public pages that stand outside the docs and the
 * workspace: the Privacy Policy, the Terms, and Support. The logo, then
 * Privacy, Terms, and Docs (Docs from tablet width up, where there is room).
 * `label` names the navigation for screen readers.
 */
export function PublicPageHeader({ label }: { label: string }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label={label} className="flex items-center gap-5 text-sm font-medium text-muted-foreground">
          <Link href={legalPaths.privacy} className={linkClass}>Privacy</Link>
          <Link href={legalPaths.terms} className={linkClass}>Terms</Link>
          <Link href="/docs" className={`hidden sm:inline ${linkClass}`}>Docs</Link>
        </nav>
      </div>
    </header>
  );
}
