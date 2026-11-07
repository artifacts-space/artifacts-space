import Link from "next/link";

import { Logo } from "@/components/logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { WebrenewMark } from "@/components/webrenew-mark";
import { COPYRIGHT_YEAR, legalContact, legalPaths, WEBRENEW_URL } from "@/lib/legal/contact";
import { REPO_URL } from "@/lib/site-copy";
import { cn } from "@/lib/utils";

/** The footer's links, in order. `external` opens in a new tab. */
export const siteFooterLinks = [
  { label: "Docs", href: "/docs" },
  { label: "Source", href: REPO_URL, external: true },
  { label: "Sign in", href: "/sign-in" },
  { label: "Create account", href: "/sign-up" },
  { label: "Privacy", href: legalPaths.privacy },
  { label: "Terms", href: legalPaths.terms },
] as const satisfies readonly { label: string; href: string; external?: boolean }[];

const linkClass = "transition-colors hover:text-foreground";

function FooterLink({ link }: { link: (typeof siteFooterLinks)[number] }) {
  if ("external" in link) {
    return <a href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>{link.label}</a>;
  }
  return <Link href={link.href} className={linkClass}>{link.label}</Link>;
}

/** The Webrenew credit: the mark, linking to webrenew.com, and the copyright line. */
function WebrenewCredit() {
  return (
    <p className="flex items-center gap-2.5">
      <a
        href={WEBRENEW_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Webrenew (opens in a new tab)"
        className="rounded-[25%] text-foreground transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <WebrenewMark />
      </a>
      <span>© {COPYRIGHT_YEAR} {legalContact.operator}</span>
    </p>
  );
}

/**
 * The site footer for the home page, the docs, and the legal pages: the logo,
 * the main links (Privacy and Terms among them), the Webrenew credit, and the
 * theme switcher. `className` adjusts the inner padding to match the page.
 */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className="border-t">
      <div className={cn("mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 py-8 text-sm text-muted-foreground", className)}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {siteFooterLinks.map((link) => <FooterLink key={link.label} link={link} />)}
          </nav>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <WebrenewCredit />
          <ThemeSwitcher />
        </div>
      </div>
    </footer>
  );
}
