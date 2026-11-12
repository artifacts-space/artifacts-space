import type { Metadata } from "next";

import { PublicPageHeader } from "@/components/public-page-header";
import { SiteFooter } from "@/components/site-footer";
import { SupportOptions } from "@/components/support/support-options";
import { supportPath } from "@/lib/legal/contact";

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

export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicPageHeader label="Site" />
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
