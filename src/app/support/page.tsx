import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { SupportOptions } from "@/components/support/support-options";
import { legalPaths, supportPath } from "@/lib/legal/contact";

/** Static: no request data, rendered once at build time. */
export const ensureStatic = "navigation";

const description = "How to get help with artifacts.space: email support, report a problem from the app, read the docs, or open an issue on GitHub.";

export const metadata: Metadata = {
  title: "Support",
  description,
  alternates: { canonical: supportPath },
  robots: { index: true, follow: true },
  openGraph: { title: "Support · artifacts.space", description, type: "website", url: supportPath },
};

const navLinkClass = "transition-colors hover:text-foreground";

function SupportHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Site" className="flex items-center gap-5 text-sm font-medium text-muted-foreground">
          <Link href="/docs" className={navLinkClass}>Docs</Link>
          <Link href={legalPaths.privacy} className={navLinkClass}>Privacy</Link>
          <Link href={legalPaths.terms} className={navLinkClass}>Terms</Link>
        </nav>
      </div>
    </header>
  );
}

export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SupportHeader />
      <main className="mx-auto w-full max-w-[780px] flex-1 px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
        <h1 className="text-3xl font-medium tracking-[-0.03em] text-balance sm:text-4xl">Get help</h1>
        <p className="mt-4 max-w-[64ch] text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          Something not working, or not sure how to do something? Tell us what happened, in the way that suits you.
        </p>
        <SupportOptions />
      </main>
      <SiteFooter className="px-4 sm:px-6" />
    </div>
  );
}
