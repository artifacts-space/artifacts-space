import type { Metadata } from "next";
import Link from "next/link";

import { DocsMobileNav } from "@/components/docs/docs-mobile-nav";
import { DocsSearch } from "@/components/docs/docs-search";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { docsNavTree, docsSearchIndex } from "@/lib/docs/navigation";

/** Every docs page is static: no request data, rendered once at build time. */
export const ensureStatic = "navigation";

export const metadata: Metadata = {
  title: { template: "%s · artifacts.space docs", default: "artifacts.space docs" },
};

const tree = docsNavTree();
const searchIndex = docsSearchIndex();

function DocsHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <DocsMobileNav tree={tree} />
        <span className="sm:hidden"><Logo compact /></span>
        <span className="hidden sm:inline"><Logo /></span>
        <span aria-hidden="true" className="text-muted-foreground/60">/</span>
        <Link href="/docs" className="text-md font-medium">Docs</Link>
        <div className="ml-auto flex min-w-0 items-center gap-4">
          <div className="w-36 min-w-0 sm:w-auto"><DocsSearch index={searchIndex} /></div>
          <Link href="/sign-in" className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground md:inline">Sign in</Link>
        </div>
      </div>
    </header>
  );
}

/** The docs shell: header with search, sidebar on wide screens (a sheet on phones), the page, and the footer. */
export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className="flex min-h-screen flex-col">
      <DocsHeader />
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 px-4 sm:px-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-14 h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain py-8 pr-6">
            <DocsSidebar tree={tree} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 lg:border-l lg:pl-10" id="docs-main">{children}</main>
      </div>
      <SiteFooter className="px-4 sm:px-6" />
    </div>
  );
}
