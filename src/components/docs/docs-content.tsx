import { IconAlertTriangle, IconInfoCircle, IconLink, IconSparkles } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { docsHeading, type DocsHeading, type DocsSlug } from "@/lib/docs/pages";
import { cn } from "@/lib/utils";

/**
 * Building blocks for docs pages. Headings take their id and title from the
 * page registry (src/lib/docs/pages.ts), so the sidebar search, "On this
 * page", and the page itself always agree.
 */

/** An h2 or h3 with an id and a link to itself. An `icon` sits before the title and should be `aria-hidden`. */
export function AnchorHeading({ heading, icon }: { heading: DocsHeading; icon?: ReactNode }) {
  const Tag = heading.level === 2 ? "h2" : "h3";
  return (
    <Tag
      id={heading.id}
      className={cn(
        "group scroll-mt-20 font-medium",
        heading.level === 2 ? "mt-12 border-t pt-8 text-2xl tracking-[-0.02em]" : "mt-10 text-lg tracking-[-0.01em]",
      )}
    >
      <a href={`#${heading.id}`} className="inline-flex items-center gap-2">
        {icon}
        <span>{heading.title}</span>
        <IconLink aria-hidden className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="sr-only">Link to this section</span>
      </a>
    </Tag>
  );
}

/** An h2 or h3 from the page registry, with a link to itself. */
export function DocsH({ page, id, icon }: { page: DocsSlug; id: string; icon?: ReactNode }) {
  return <AnchorHeading heading={docsHeading(page, id)} icon={icon} />;
}

/** Running text. Uses the artifact prose styles: paragraphs, lists, inline code, tables, links. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("artifact-prose mt-4 max-w-none text-md leading-7 sm:text-base", className)}>{children}</div>;
}

const noteTones = {
  info: { Icon: IconInfoCircle, className: "text-tone-info" },
  warning: { Icon: IconAlertTriangle, className: "text-tone-warning" },
  new: { Icon: IconSparkles, className: "text-tone-success" },
} as const;

/** A short note set apart from the text. */
export function Note({ tone = "info", title, children }: { tone?: keyof typeof noteTones; title?: string; children: ReactNode }) {
  const { Icon, className } = noteTones[tone];
  return (
    <div role="note" className="card-surface mt-6 flex gap-3 px-4 py-3 text-md leading-6">
      <Icon aria-hidden className={cn("mt-1 size-4 shrink-0", className)} />
      <div className="min-w-0 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-sm">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={cn(title && "mt-0.5 text-muted-foreground")}>{children}</div>
      </div>
    </div>
  );
}

/** Inline code outside a Prose block. */
export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">{children}</code>;
}

/** A simple table for facts, outside Prose. Rows are cells in order. All-empty `head` cells leave out the header row. */
export function FactTable({ head, rows, mono = [0] }: { head: string[]; rows: ReactNode[][]; mono?: number[] }) {
  return (
    <div className="card-surface mt-6 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {head.some(Boolean) ? (
          <thead className="bg-muted/50">
            <tr>
              {head.map((cell, index) => <th key={`${cell}-${String(index)}`} scope="col" className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground">{cell}</th>)}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t align-top first:border-t-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={cn("px-3 py-2 leading-6", mono.includes(cellIndex) ? "font-mono text-sm whitespace-nowrap" : "min-w-40 text-muted-foreground")}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Plain text where `backticked` words show as inline code, as in catalog descriptions. */
export function InlineCodeText({ text }: { text: string }) {
  return text.split(/(`[^`]+`)/g).map((part, index) =>
    part.length > 2 && part.startsWith("`") && part.endsWith("`") ? <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-sm">{part.slice(1, -1)}</code> : part,
  );
}
