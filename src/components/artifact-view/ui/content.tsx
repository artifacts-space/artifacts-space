"use client";

import { IconAlertTriangle, IconArrowRight, IconCheck, IconCircleCheck, IconInfoCircle, IconNote, IconOctagon, IconX } from "@tabler/icons-react";

import { ExternalLink } from "@/components/artifact-view/external-link";
import { CodeBlock } from "@/components/code/code-block";
import { MarkdownView } from "@/components/artifact-view/markdown-view";
import { externalLinkRel, safeHref } from "@/lib/link-policy";
import type { UiProps } from "@/lib/ui/catalog";
import type { InkTone } from "@/lib/ui/props/screen";
import type { TextAlign, Tone } from "@/lib/ui/props/shared";
import { hasTitleText } from "@/lib/ui/title-rules";
import { cn } from "@/lib/utils";

import { uiIconComponents } from "./icon-glyphs";
import type { ViewProps } from "./stout";

/** Heading classes by level; the interface editor uses them for headings typed in place. */
export const headingClass = {
  1: "text-3xl font-medium leading-[1.12] tracking-[-0.025em] @xl/ui:text-4xl",
  2: "text-xl font-medium leading-snug tracking-[-0.015em]",
  3: "text-base font-medium leading-snug",
  4: "text-md font-medium text-muted-foreground",
} as const;

type HeadingProps = UiProps<"Heading">;
type TextProps = UiProps<"Text">;

/** Heading classes by `size`, which sets the look whatever the level. The two largest grow with the page column or canvas frame. */
const headingSize: Record<NonNullable<HeadingProps["size"]>, string> = {
  sm: "text-base font-medium leading-snug",
  md: "text-xl font-medium leading-snug tracking-[-0.015em]",
  lg: "text-2xl font-medium leading-tight tracking-[-0.02em]",
  xl: "text-3xl font-medium leading-[1.12] tracking-[-0.025em]",
  "2xl": "text-3xl font-medium leading-[1.1] tracking-[-0.025em] @2xl/ui:text-5xl",
  display: "text-4xl font-medium leading-[1.05] tracking-[-0.03em] @2xl/ui:text-6xl",
};

const alignText: Record<TextAlign, string> = { start: "text-start", center: "text-center", end: "text-end" };
/** A block capped at the reading measure moves with its alignment, so centered text sits in the center of its container. */
const alignBlock: Record<TextAlign, string> = { start: "", center: "mx-auto", end: "ms-auto" };

/** Every class a heading takes from its props; the interface editor draws headings typed in place with it. */
export function headingClassName(props: Pick<HeadingProps, "level" | "size" | "align">): string {
  const level = (props.level ?? 2) as keyof typeof headingClass;
  return cn("min-w-0 text-balance break-words", props.size ? headingSize[props.size] : headingClass[level], props.align && alignText[props.align]);
}

export function HeadingView({ props }: ViewProps<"Heading">) {
  // Only spaces show nothing, so no empty heading reaches the outline (the editor drops it by the same rule).
  if (!hasTitleText(props.text)) return null;
  const Tag = (["h1", "h2", "h3", "h4"] as const)[(props.level ?? 2) - 1] ?? "h2";
  return <Tag className={headingClassName(props)}>{props.text}</Tag>;
}

/** Text classes by size; the interface editor uses them too. */
export const textSize = {
  xs: "text-xs leading-5",
  sm: "text-sm leading-6",
  md: "text-md leading-7",
  lg: "text-lg leading-8",
  xl: "text-xl leading-8",
  "2xl": "text-2xl leading-9",
  "3xl": "text-3xl leading-10 tracking-[-0.02em]",
  "4xl": "text-4xl leading-[1.1] tracking-[-0.025em]",
} as const;

/** Text colors for Text and Icon: status tones hold 4.5:1 on every surface a Box paints (toneTokens in src/lib/themes/derive.ts). */
export const inkToneClass: Record<InkTone, string> = {
  default: "",
  muted: "text-muted-foreground",
  info: "text-tone-info",
  success: "text-tone-success",
  warning: "text-tone-warning",
  danger: "text-tone-danger",
};

const textWeight: Record<NonNullable<TextProps["weight"]>, string> = { normal: "font-normal", medium: "font-medium", semibold: "font-semibold" };
const textClamp = { 1: "line-clamp-1", 2: "line-clamp-2", 3: "line-clamp-3" } as const;

/** What a variant sets when `size` and `tone` are left out; both still win when given. */
const textVariant: Record<NonNullable<TextProps["variant"]>, { size: keyof typeof textSize; tone: InkTone; extra: string }> = {
  body: { size: "md", tone: "default", extra: "" },
  eyebrow: { size: "xs", tone: "muted", extra: "font-medium tracking-[0.08em] uppercase" },
  caption: { size: "xs", tone: "muted", extra: "" },
  mono: { size: "sm", tone: "default", extra: "font-mono" },
};

/** Every class a paragraph takes from its props; the interface editor draws text typed in place with it. */
export function textClassName(props: Omit<TextProps, "text">): string {
  const variant = textVariant[props.variant ?? "body"];
  return cn(
    "max-w-[var(--artifact-measure,72ch)] break-words",
    textSize[props.size ?? variant.size],
    inkToneClass[props.tone ?? variant.tone],
    variant.extra,
    props.weight && textWeight[props.weight],
    props.align && alignText[props.align],
    props.align && alignBlock[props.align],
    props.clamp && textClamp[props.clamp as keyof typeof textClamp],
  );
}

export function TextView({ props }: ViewProps<"Text">) {
  if (!props.text) return null;
  return <p className={cn("whitespace-pre-line", textClassName(props))}>{props.text}</p>;
}

export function MarkdownBlockView({ props }: ViewProps<"Markdown">) {
  if (!props.content.trim()) return null;
  return <MarkdownView content={props.content} diagrams />;
}

export function CodeView({ props }: ViewProps<"Code">) {
  return <CodeBlock code={props.code} language={props.language} title={props.title} capHeight />;
}

/** Callout colors and icon per tone; the interface editor uses them too. */
export const toneStyles: Record<Tone, { box: string; icon: string; Icon: typeof IconInfoCircle }> = {
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

type BadgeProps = UiProps<"Badge">;

/** A solid badge is the tone as the fill, with the page color as its text: the same pair as the tone as text on the page. */
const badgeSolid: Record<Tone, string> = {
  neutral: "border-transparent bg-foreground text-background",
  info: "border-transparent bg-tone-info text-background",
  success: "border-transparent bg-tone-success text-background",
  warning: "border-transparent bg-tone-warning text-background",
  danger: "border-transparent bg-tone-danger text-background",
};

const badgeOutline: Record<Tone, string> = {
  neutral: "border-border text-foreground",
  info: "border-tone-info/40 text-tone-info",
  success: "border-tone-success/40 text-tone-success",
  warning: "border-tone-warning/45 text-tone-warning",
  danger: "border-tone-danger/40 text-tone-danger",
};

const badgeVariant: Record<NonNullable<BadgeProps["variant"]>, Record<Tone, string>> = { soft: badgeTone, solid: badgeSolid, outline: badgeOutline };

/** Every class a badge takes from its props; the interface editor draws badges typed in place with it. */
export function badgeClassName(props: Pick<BadgeProps, "tone" | "variant">): string {
  return cn("inline-flex h-5 w-fit max-w-full items-center gap-1 rounded-full border px-2 text-xs font-medium", badgeVariant[props.variant ?? "soft"][props.tone ?? "neutral"]);
}

/** A badge's icon, before its label; the interface editor draws it beside a label typed in place. */
export function BadgeIcon({ name }: { name: BadgeProps["icon"] }) {
  const Glyph = name ? uiIconComponents[name] : null;
  return Glyph ? <Glyph aria-hidden className="size-3 shrink-0" /> : null;
}

export function BadgeView({ props }: ViewProps<"Badge">) {
  return (
    <span className={badgeClassName(props)}>
      <BadgeIcon name={props.icon} />
      <span className="truncate">{props.label}</span>
    </span>
  );
}

/** A list marker drawn as an icon; the dot is the browser's own bullet. */
export type ListMarker = Exclude<NonNullable<UiProps<"List">["marker"]>, "dot">;

/** The icon and color of each list marker: a check reads as included, a cross and an arrow stay quiet. */
const listMarker: Record<ListMarker, { Glyph: typeof IconCheck; className: string }> = {
  check: { Glyph: IconCheck, className: "text-tone-success" },
  cross: { Glyph: IconX, className: "text-muted-foreground" },
  arrow: { Glyph: IconArrowRight, className: "text-muted-foreground" },
};

const listKey = (item: string, index: number) => `${String(index)}-${item.slice(0, 20)}`;

/** The classes of a list with icon markers; the interface editor draws list items typed in place with them. */
export const markedListClass = { list: "max-w-[var(--artifact-measure,72ch)] space-y-1.5 text-md leading-7", item: "flex min-w-0 gap-2", text: "min-w-0 break-words" } as const;

/** The icon marker a list draws, or null for a numbered list and for plain bullets. */
export function listMarkerOf(props: Pick<UiProps<"List">, "ordered" | "marker">): ListMarker | null {
  return !props.ordered && props.marker && props.marker !== "dot" ? props.marker : null;
}

/** One item's marker icon. */
export function ListMark({ marker }: { marker: ListMarker }) {
  const { Glyph, className } = listMarker[marker];
  return <Glyph aria-hidden className={cn("mt-1.5 size-4 shrink-0", className)} />;
}

function MarkedList({ items, marker }: { items: string[]; marker: ListMarker }) {
  return (
    <ul className={markedListClass.list}>
      {items.map((item, index) => (
        <li key={listKey(item, index)} className={markedListClass.item}>
          <ListMark marker={marker} />
          <span className={markedListClass.text}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function ListView({ props }: ViewProps<"List">) {
  if (props.items.length === 0) return <p className="text-sm text-muted-foreground">No items.</p>;
  const marker = listMarkerOf(props);
  if (marker) return <MarkedList items={props.items} marker={marker} />;
  const Tag = props.ordered ? "ol" : "ul";
  return (
    <Tag className={cn("max-w-[var(--artifact-measure,72ch)] space-y-1 pl-5 text-md leading-7 marker:text-muted-foreground", props.ordered ? "list-decimal" : "list-disc")}>
      {props.items.map((item, index) => (
        <li key={listKey(item, index)} className="break-words">{item}</li>
      ))}
    </Tag>
  );
}

type LinkProps = UiProps<"Link">;

type LinkVariant = NonNullable<LinkProps["variant"]>;

const linkVariantClass: Record<LinkVariant, string> = {
  inline: "text-md underline decoration-border underline-offset-[3px] hover:decoration-foreground",
  nav: "text-sm font-medium text-foreground underline-offset-[6px] hover:underline",
  muted: "text-sm text-muted-foreground hover:text-foreground",
};

/** What `active` adds to each variant: the mark of the page a reader is on. */
const linkActiveClass: Record<LinkVariant, string> = { inline: "", nav: "underline", muted: "font-medium text-foreground" };

/** Every class a link's words take from its props; the interface editor draws link text typed in place with it. */
export function linkClassName(props: Pick<LinkProps, "variant" | "active">): string {
  const variant = props.variant ?? "inline";
  return cn(linkVariantClass[variant], props.active && linkActiveClass[variant]);
}

const linkFocus = "transition-colors focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * A link. With an `href` it opens in a new tab under the same URL rules as
 * every link in an artifact, and the inline variant keeps the external-link
 * mark. Without one it is the same words in the same style, going nowhere,
 * for a mockup's menu.
 */
export function LinkView({ props }: ViewProps<"Link">) {
  const variant = props.variant ?? "inline";
  const current = props.active ? { "aria-current": "page" as const } : {};
  const href = safeHref(props.href);
  if (!href) return <span {...current} className={cn("min-w-0 break-words", linkClassName(props))}>{props.label}</span>;
  if (variant === "inline") {
    return (
      <span className="min-w-0 text-md break-words">
        <ExternalLink href={href} current={props.active}>{props.label}</ExternalLink>
      </span>
    );
  }
  return (
    <a {...current} href={href} target="_blank" rel={externalLinkRel} className={cn("min-w-0 break-words", linkClassName(props), linkFocus)}>
      {props.label}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
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
