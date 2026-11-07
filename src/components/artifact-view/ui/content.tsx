"use client";

import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconNote, IconOctagon } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { ExternalLink } from "@/components/artifact-view/external-link";
import { MarkdownView } from "@/components/artifact-view/markdown-view";
import type { Tone } from "@/lib/ui/props/shared";
import { cn } from "@/lib/utils";

import type { ViewProps } from "./stout";

const headingClass = {
  1: "text-3xl font-medium leading-[1.12] tracking-[-0.025em] sm:text-4xl",
  2: "text-xl font-medium leading-snug tracking-[-0.015em]",
  3: "text-base font-medium leading-snug",
  4: "text-md font-medium text-muted-foreground",
} as const;

export function HeadingView({ props }: ViewProps<"Heading">) {
  const level = (props.level ?? 2) as keyof typeof headingClass;
  const Tag = (["h1", "h2", "h3", "h4"] as const)[level - 1] ?? "h2";
  return <Tag className={cn("min-w-0 text-balance break-words", headingClass[level])}>{props.text}</Tag>;
}

const textSize = { sm: "text-sm leading-6", md: "text-md leading-7", lg: "text-lg leading-8" } as const;

export function TextView({ props }: ViewProps<"Text">) {
  if (!props.text) return null;
  return (
    <p className={cn("max-w-[72ch] whitespace-pre-line break-words", textSize[props.size ?? "md"], props.tone === "muted" && "text-muted-foreground")}>
      {props.text}
    </p>
  );
}

export function MarkdownBlockView({ props }: ViewProps<"Markdown">) {
  if (!props.content.trim()) return null;
  return <MarkdownView content={props.content} />;
}

/** A code block with an optional title and language label. `actions` sit at the right of the header. */
export function CodeBlock({ code, language, title, actions }: { code: string; language?: string | undefined; title?: string | undefined; actions?: ReactNode }) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-md border bg-muted/40 shadow-xs">
      {title || language || actions ? (
        <figcaption className="flex min-h-9 items-center gap-2 border-b px-3.5 py-1.5 text-xs text-muted-foreground">
          {title ? <span className="min-w-0 truncate font-medium text-foreground">{title}</span> : null}
          {language ? <span className="ml-auto min-w-0 truncate font-mono">{language}</span> : null}
          {actions ? <span className={cn("shrink-0", !language && "ml-auto")}>{actions}</span> : null}
        </figcaption>
      ) : null}
      <pre tabIndex={0} className="max-h-[32rem] overflow-auto p-3.5 font-mono text-sm leading-6 focus-visible:outline-2 focus-visible:outline-ring">
        <code>{code || " "}</code>
      </pre>
    </figure>
  );
}

export function CodeView({ props }: ViewProps<"Code">) {
  return <CodeBlock code={props.code} language={props.language} title={props.title} />;
}

const toneStyles: Record<Tone, { box: string; icon: string; Icon: typeof IconInfoCircle }> = {
  neutral: { box: "border-border bg-muted/50", icon: "text-muted-foreground", Icon: IconNote },
  info: { box: "border-tone-info/30 bg-tone-info/8", icon: "text-tone-info", Icon: IconInfoCircle },
  success: { box: "border-tone-success/30 bg-tone-success/8", icon: "text-tone-success", Icon: IconCircleCheck },
  warning: { box: "border-tone-warning/35 bg-tone-warning/10", icon: "text-tone-warning", Icon: IconAlertTriangle },
  danger: { box: "border-tone-danger/30 bg-tone-danger/8", icon: "text-tone-danger", Icon: IconOctagon },
};

export function CalloutView({ props }: ViewProps<"Callout">) {
  const style = toneStyles[props.tone ?? "info"];
  return (
    <div role="note" className={cn("flex min-w-0 gap-3 rounded-md border px-4 py-3 shadow-xs", style.box)}>
      <style.Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", style.icon)} />
      <div className="min-w-0 space-y-0.5 text-md leading-6">
        {props.title ? <p className="font-medium break-words">{props.title}</p> : null}
        <p className="whitespace-pre-line break-words text-foreground/85">{props.text}</p>
      </div>
    </div>
  );
}

/** Badge colors per tone. */
export const badgeTone: Record<Tone, string> = {
  neutral: "border-border bg-muted text-foreground",
  info: "border-tone-info/30 bg-tone-info/10 text-tone-info",
  success: "border-tone-success/30 bg-tone-success/10 text-tone-success",
  warning: "border-tone-warning/35 bg-tone-warning/12 text-tone-warning",
  danger: "border-tone-danger/30 bg-tone-danger/10 text-tone-danger",
};

/** Small status-dot colors per tone (Board columns, Calendar events). */
export const toneDot: Record<Tone, string> = {
  neutral: "bg-muted-foreground/50",
  info: "bg-tone-info",
  success: "bg-tone-success",
  warning: "bg-tone-warning",
  danger: "bg-tone-danger",
};

export function BadgeView({ props }: ViewProps<"Badge">) {
  return (
    <span className={cn("inline-flex h-5 w-fit max-w-full items-center truncate rounded-full border px-2 text-xs font-medium", badgeTone[props.tone ?? "neutral"])}>
      {props.label}
    </span>
  );
}

export function ListView({ props }: ViewProps<"List">) {
  if (props.items.length === 0) return <p className="text-sm text-muted-foreground">No items.</p>;
  const Tag = props.ordered ? "ol" : "ul";
  return (
    <Tag className={cn("max-w-[72ch] space-y-1 pl-5 text-md leading-7 marker:text-muted-foreground", props.ordered ? "list-decimal" : "list-disc")}>
      {props.items.map((item, index) => (
        <li key={`${String(index)}-${item.slice(0, 20)}`} className="break-words">{item}</li>
      ))}
    </Tag>
  );
}

export function LinkView({ props }: ViewProps<"Link">) {
  return (
    <span className="min-w-0 text-md break-words">
      <ExternalLink href={props.href}>{props.label}</ExternalLink>
    </span>
  );
}

export function QuoteView({ props }: ViewProps<"Quote">) {
  return (
    <figure className="min-w-0 border-l-2 pl-4">
      <blockquote className="text-md leading-7 whitespace-pre-line break-words">{props.text}</blockquote>
      {props.cite ? <figcaption className="mt-1.5 text-sm text-muted-foreground break-words">— {props.cite}</figcaption> : null}
    </figure>
  );
}
