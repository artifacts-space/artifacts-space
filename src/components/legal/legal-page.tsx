import type { ReactNode } from "react";

import { AnchorHeading } from "@/components/docs/docs-content";
import { DocsToc } from "@/components/docs/docs-toc";
import { PublicPageHeader } from "@/components/public-page-header";
import { SiteFooter } from "@/components/site-footer";
import { legalContact, legalDates, mailtoHref } from "@/lib/legal/contact";
import { legalHeading, legalHeadings, legalSections, type LegalDocument } from "@/lib/legal/headings";

/** An anchored section heading of a legal document, from src/lib/legal/headings.ts. */
export function LegalH({ doc, id }: { doc: LegalDocument; id: string }) {
  return <AnchorHeading heading={legalHeading(doc, id)} />;
}

/** A mailto link to one of the contact addresses, showing the address. */
export function Mail({ to, subject }: { to: string; subject?: string }) {
  return <a href={mailtoHref(to, subject)}>{to}</a>;
}

/** The operator's name and postal address as a block. */
export function PostalAddress() {
  return (
    <address className="not-italic">
      {legalContact.operator}
      <br />
      {legalContact.street}
      <br />
      {legalContact.city}
      <br />
      {legalContact.country}
    </address>
  );
}

/** "In plain terms": the short summary at the top of each document. It explains; the sections below govern. */
function PlainTerms({ points }: { points: readonly ReactNode[] }) {
  return (
    <section aria-labelledby="plain-terms" className="card-surface mt-8 px-5 py-5 sm:px-6">
      <h2 id="plain-terms" className="text-lg font-medium tracking-[-0.01em]">In plain terms</h2>
      <ul className="mt-3 space-y-2 text-md leading-6 text-muted-foreground">
        {points.map((point, index) => (
          <li key={index} className="flex gap-3">
            <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">This summary helps you read the full text below. Where they differ, the full text applies.</p>
    </section>
  );
}

/** The compact contents list for phones and tablets; wide screens get the sticky "On this page" instead. */
function InlineContents({ doc }: { doc: LegalDocument }) {
  return (
    <nav aria-label="Contents" className="mt-8 xl:hidden">
      <p className="text-sm font-medium">Contents</p>
      <ol className="mt-2 grid gap-x-6 gap-y-1.5 text-sm text-muted-foreground sm:grid-cols-2">
        {legalSections(doc).map((heading, index) => (
          <li key={heading.id} className="flex gap-2">
            <span className="w-5 shrink-0 text-right font-mono text-xs leading-5 text-muted-foreground/70">{index + 1}</span>
            <a href={`#${heading.id}`} className="transition-colors hover:text-foreground">{heading.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface LegalPageProps {
  doc: LegalDocument;
  title: string;
  lead: string;
  summary: readonly ReactNode[];
  children: ReactNode;
}

/** The shell for the Privacy Policy and the Terms: header, title and dates, plain-terms summary, contents, the document, and the site footer. */
export function LegalPage({ doc, title, lead, summary, children }: LegalPageProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicPageHeader label="Legal" />
      <div className="mx-auto flex w-full max-w-[1100px] flex-1 gap-12 px-4 sm:px-6">
        <article className="min-w-0 max-w-[780px] flex-1 pt-10 pb-20 sm:pt-14">
          <p className="text-sm text-muted-foreground">Legal</p>
          <h1 className="mt-2 text-3xl font-medium tracking-[-0.03em] text-balance sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-[64ch] text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{lead}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            Effective <time dateTime={legalDates.effective.iso}>{legalDates.effective.label}</time> · Last updated{" "}
            <time dateTime={legalDates.updated[doc].iso}>{legalDates.updated[doc].label}</time>
          </p>
          <PlainTerms points={summary} />
          <InlineContents doc={doc} />
          <div className="mt-4">{children}</div>
        </article>
        <aside className="hidden w-56 shrink-0 xl:block">
          <div className="sticky top-0 max-h-dvh overflow-y-auto overscroll-contain pt-14 pb-10">
            <DocsToc headings={legalHeadings[doc]} />
          </div>
        </aside>
      </div>
      <SiteFooter className="px-4 sm:px-6" />
    </div>
  );
}
