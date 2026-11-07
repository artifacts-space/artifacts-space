import { IconArrowLeft, IconArrowRight, IconPencil } from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { docsNeighbors, type DocsLink } from "@/lib/docs/navigation";
import { docsHref, docsPage, editUrl, type DocsHeading, type DocsSlug } from "@/lib/docs/pages";
import { cn } from "@/lib/utils";

import { DocsToc } from "./docs-toc";

function NeighborLink({ link, direction }: { link: DocsLink; direction: "previous" | "next" }) {
  const next = direction === "next";
  return (
    <Link
      href={link.href}
      className={cn("group flex min-w-0 flex-1 flex-col gap-1 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50", next && "items-end text-right")}
    >
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {next ? null : <IconArrowLeft aria-hidden className="size-3.5" />}
        {next ? "Next" : "Previous"}
        {next ? <IconArrowRight aria-hidden className="size-3.5" /> : null}
      </span>
      <span className="max-w-full truncate text-md font-medium">{link.title}</span>
    </Link>
  );
}

interface DocsPageProps {
  /** The canonical path of this page, such as /docs/quickstart. */
  href: string;
  /** The section or group shown above the title. */
  eyebrow: string;
  title: string;
  description: ReactNode;
  /** The repository file people edit to change this page. */
  source: string;
  headings: readonly DocsHeading[];
  wide?: boolean;
  children: ReactNode;
}

/**
 * One docs page: the title and lead, the content, an edit link, and
 * previous/next links, with "On this page" beside it on wide screens.
 */
export function DocsPage({ href, eyebrow, title, description, source, headings, wide = false, children }: DocsPageProps) {
  const { previous, next } = docsNeighbors(href);
  const showToc = !wide && headings.length > 0;
  return (
    <div className="flex min-w-0 gap-12">
      <article className={cn("min-w-0 flex-1 pt-8 pb-16 sm:pt-10", !wide && "max-w-[780px]")} data-docs-article="">
        <p className="text-sm text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.03em] text-balance sm:text-4xl">{title}</h1>
        <p className="mt-4 max-w-[64ch] text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{description}</p>
        <div className="mt-10">{children}</div>
        <footer className="mt-16 border-t pt-6">
          <a href={editUrl(source)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground" target="_blank" rel="noreferrer">
            <IconPencil aria-hidden className="size-3.5" /> Edit this page on GitHub
          </a>
          <nav aria-label="Previous and next" className="mt-6 flex flex-col gap-3 sm:flex-row">
            {previous ? <NeighborLink link={previous} direction="previous" /> : <span className="hidden flex-1 sm:block" />}
            {next ? <NeighborLink link={next} direction="next" /> : null}
          </nav>
        </footer>
      </article>
      {showToc ? (
        <aside className="hidden w-56 shrink-0 xl:block">
          <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain pt-10 pb-10">
            <DocsToc headings={headings} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

/** A page from the registry in src/lib/docs/pages.ts: title, lead, headings, and source come from there. */
export function RegistryPage({ slug, children }: { slug: DocsSlug; children: ReactNode }) {
  const page = docsPage(slug);
  return (
    <DocsPage href={docsHref(page.slug)} eyebrow={page.section} title={page.title} description={page.description} source={page.source} headings={page.headings} wide={page.wide ?? false}>
      {children}
    </DocsPage>
  );
}
