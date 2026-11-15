"use client";

import { useContext, useRef, type ReactNode } from "react";

import { scrollStopProps } from "@/components/code/scroll-stop";
import { useScrollable } from "@/components/code/use-scrollable";
import { blockHues, type BlockHue } from "@/lib/block-colors/block-color-rules";
import type { UiProps } from "@/lib/ui/catalog";
import type { BoxSurface } from "@/lib/ui/props/screen";
import type { ContainerStep, Space } from "@/lib/ui/props/shared";
import { cn } from "@/lib/utils";

import { ThemeScopeContext, strongSurfaceScope, type ThemeScopeValue } from "../theme-scope-context";

import { radiusClass } from "./scales";
import type { ViewProps } from "./stout";

type BoxProps = UiProps<"Box">;

/** A class from a lookup table, or nothing when the prop is unset. */
function pick<K extends string>(table: Record<K, string>, key: K | undefined): string | undefined {
  return key === undefined ? undefined : table[key];
}

/** The three largest steps shrink on a narrow page column or canvas frame, where 64 pixels of padding would crowd the content. */
const gapClass: Record<Space, string> = { none: "gap-0", xs: "gap-1", sm: "gap-2", md: "gap-4", lg: "gap-6", xl: "gap-6 @2xl/ui:gap-10", "2xl": "gap-8 @2xl/ui:gap-16", "3xl": "gap-12 @2xl/ui:gap-24" };
const padClass: Record<Space, string> = { none: "p-0", xs: "p-1", sm: "p-2", md: "p-4", lg: "p-6", xl: "p-6 @2xl/ui:p-10", "2xl": "p-8 @2xl/ui:p-16", "3xl": "p-12 @2xl/ui:p-24" };
const padXClass: Record<Space, string> = { none: "px-0", xs: "px-1", sm: "px-2", md: "px-4", lg: "px-6", xl: "px-6 @2xl/ui:px-10", "2xl": "px-8 @2xl/ui:px-16", "3xl": "px-12 @2xl/ui:px-24" };
const padYClass: Record<Space, string> = { none: "py-0", xs: "py-1", sm: "py-2", md: "py-4", lg: "py-6", xl: "py-6 @2xl/ui:py-10", "2xl": "py-8 @2xl/ui:py-16", "3xl": "py-12 @2xl/ui:py-24" };

const alignClass: Record<NonNullable<BoxProps["align"]>, string> = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" };
const justifyClass: Record<NonNullable<BoxProps["justify"]>, string> = { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" };
const maxWidthClass: Record<NonNullable<BoxProps["maxWidth"]>, string> = { xs: "w-full max-w-xs", sm: "w-full max-w-sm", md: "w-full max-w-xl", lg: "w-full max-w-3xl", xl: "w-full max-w-5xl", "2xl": "w-full max-w-7xl" };
const minHeightClass: Record<NonNullable<BoxProps["minHeight"]>, string> = { sm: "min-h-24", md: "min-h-48", lg: "min-h-80", xl: "min-h-128" };
const borderClass: Record<NonNullable<BoxProps["border"]>, string> = { none: "", all: "border", top: "border-t", bottom: "border-b", start: "border-s", end: "border-e", x: "border-x", y: "border-y" };
const shadowClass: Record<NonNullable<BoxProps["shadow"]>, string> = { none: "", sm: "shadow-sm", md: "shadow-md", lg: "shadow-lg" };
const overflowClass: Record<NonNullable<BoxProps["overflow"]>, string> = { visible: "", hidden: "overflow-hidden", scroll: "overflow-x-auto *:shrink-0" };

type Align = NonNullable<BoxProps["align"]>;
type Justify = NonNullable<BoxProps["justify"]>;

/** Width steps of the named `ui` container (the page column or a canvas frame): 576, 672, and 896 pixels. */
const rowFrom: Record<ContainerStep, string> = { sm: "flex-col @xl/ui:flex-row", md: "flex-col @2xl/ui:flex-row", lg: "flex-col @4xl/ui:flex-row" };
/** The same row, stacked last child first. */
const reversedRowFrom: Record<ContainerStep, string> = { sm: "flex-col-reverse @xl/ui:flex-row", md: "flex-col-reverse @2xl/ui:flex-row", lg: "flex-col-reverse @4xl/ui:flex-row" };
/** The row's own `align` and `justify`, from the width where it is a row again. */
const alignFrom: Record<ContainerStep, Record<Align, string>> = {
  sm: { start: "@xl/ui:items-start", center: "@xl/ui:items-center", end: "@xl/ui:items-end", stretch: "@xl/ui:items-stretch" },
  md: { start: "@2xl/ui:items-start", center: "@2xl/ui:items-center", end: "@2xl/ui:items-end", stretch: "@2xl/ui:items-stretch" },
  lg: { start: "@4xl/ui:items-start", center: "@4xl/ui:items-center", end: "@4xl/ui:items-end", stretch: "@4xl/ui:items-stretch" },
};
const justifyFrom: Record<ContainerStep, Record<"start" | "end", string>> = {
  sm: { start: "@xl/ui:justify-start", end: "@xl/ui:justify-end" },
  md: { start: "@2xl/ui:justify-start", end: "@2xl/ui:justify-end" },
  lg: { start: "@4xl/ui:justify-start", end: "@4xl/ui:justify-end" },
};
const shownFrom: Record<ContainerStep, string> = { sm: "hidden @xl/ui:flex", md: "hidden @2xl/ui:flex", lg: "hidden @4xl/ui:flex" };
const hiddenFrom: Record<ContainerStep, string> = { sm: "@xl/ui:hidden", md: "@2xl/ui:hidden", lg: "@4xl/ui:hidden" };

const hues: ReadonlySet<string> = new Set(blockHues);
const isHue = (surface: BoxSurface): surface is BlockHue => hues.has(surface);

/** Each surface paints a token and sets the text color that reads on it. Inverse and primary paint the page of the palette they switch to. */
const surfaceClass: Record<Exclude<BoxSurface, BlockHue>, string> = {
  none: "",
  page: "bg-background text-foreground",
  card: "bg-card text-card-foreground",
  muted: "bg-muted text-foreground",
  inverse: "bg-background text-foreground",
  primary: "bg-background text-foreground",
};

/** The step a row stacks below, or nothing for a column or a row that never stacks. */
function stackStep(props: BoxProps): ContainerStep | undefined {
  return props.direction === "horizontal" ? props.stackBelow : undefined;
}

function directionClass(props: BoxProps): string {
  if (props.direction !== "horizontal") return "flex-col";
  const step = stackStep(props);
  if (!step) return "flex-row";
  return props.reverseBelow ? reversedRowFrom[step] : rowFrom[step];
}

/** `alignBelow` while the row is stacked, and the row's own `align` (stretch when unset) from the width where it is a row. */
function alignClasses(props: BoxProps): string | undefined {
  const step = stackStep(props);
  if (!step || !props.alignBelow) return pick(alignClass, props.align);
  return cn(alignClass[props.alignBelow], alignFrom[step][props.align ?? "stretch"]);
}

/**
 * A reversed column packs from its far end, so a stacked row drawn in
 * reverse takes the opposite `justify` while it is stacked: its children
 * still gather at the top for start and at the bottom for end.
 */
function justifyClasses(props: BoxProps): string | undefined {
  const step = stackStep(props);
  const justify: Justify = props.justify ?? "start";
  if (!step || !props.reverseBelow || justify === "center" || justify === "between") return pick(justifyClass, props.justify);
  return cn(justifyClass[justify === "start" ? "end" : "start"], justifyFrom[step][justify]);
}

function layoutClass(props: BoxProps): string {
  return cn(
    "min-w-0",
    pick(shownFrom, props.hideBelow) ?? "flex",
    pick(hiddenFrom, props.hideAbove),
    directionClass(props),
    pick(gapClass, props.gap),
    pick(padClass, props.padding),
    pick(padXClass, props.paddingX),
    pick(padYClass, props.paddingY),
    alignClasses(props),
    justifyClasses(props),
    props.wrap && "flex-wrap",
    props.grow && "flex-1",
    props.width === "full" && "w-full",
    pick(maxWidthClass, props.maxWidth),
    pick(minHeightClass, props.minHeight),
  );
}

/**
 * Twice each padding step: the room a growing Box claims in a row before
 * the free room is shared out, since its padding is part of its starting
 * size. The editor's frame has no padding of its own, so it claims the same.
 */
const growBasis: Record<Space, string> = { none: "basis-0", xs: "basis-2", sm: "basis-4", md: "basis-8", lg: "basis-12", xl: "basis-12 @2xl/ui:basis-20", "2xl": "basis-16 @2xl/ui:basis-32", "3xl": "basis-24 @2xl/ui:basis-48" };

/**
 * The classes that place a Box in its parent: the room it takes and whether
 * it shows. The interface editor wraps each block in a frame, so the frame
 * takes these and the Box fills the frame, and a Box sits in a row the same
 * way while it is edited.
 */
export function boxPlacementClass(props: Pick<BoxProps, "grow" | "width" | "maxWidth" | "hideBelow" | "hideAbove" | "padding" | "paddingX">): string {
  return cn(
    pick(shownFrom, props.hideBelow) ?? "flex",
    pick(hiddenFrom, props.hideAbove),
    props.grow && cn("shrink grow", growBasis[props.paddingX ?? props.padding ?? "none"]),
    props.width === "full" && "w-full",
    pick(maxWidthClass, props.maxWidth),
  );
}

function finishClass(props: BoxProps): string {
  return cn(pick(borderClass, props.border), pick(radiusClass, props.radius), pick(shadowClass, props.shadow), pick(overflowClass, props.overflow));
}

interface Painted {
  className: string;
  style: Record<string, string> | undefined;
  /** The context for the views inside a strong surface; null for every other surface. */
  inner: ThemeScopeValue | null;
}

const unpainted: Painted = { className: "", style: undefined, inner: null };

/** A quiet fill: the token, plus re-lit text where the theme needs it on that fill. */
function quietSurface(surface: "muted" | BlockHue, scoped: ThemeScopeValue | null): Painted {
  const ink = scoped?.surfaces?.quietInk(surface) ?? {};
  if (surface === "muted") return { className: surfaceClass.muted, style: ink, inner: null };
  return { className: "text-foreground", style: { backgroundColor: `var(--block-${surface}-bg)`, ...ink }, inner: null };
}

/** The class, token values, and inner context a Box's surface needs here. */
function paint(surface: BoxSurface, scoped: ThemeScopeValue | null): Painted {
  if (surface === "muted" || isHue(surface)) return quietSurface(surface, scoped);
  if (surface !== "inverse" && surface !== "primary") return { ...unpainted, className: surfaceClass[surface] };
  const strong = strongSurfaceScope(scoped, surface);
  if (!strong) return { ...unpainted, className: surfaceClass[surface] };
  return { className: cn(strong.className, surfaceClass[surface]), style: strong.style, inner: strong.value };
}

/** The accessible name a Box takes from its label: a named group, or nothing. */
function namedGroup(label: string | undefined): { role?: "group"; "aria-label"?: string } {
  return label ? { role: "group", "aria-label": label } : {};
}

/** A row that scrolls sideways: a named group and a tab stop while it actually scrolls, so the keyboard can scroll it too. */
function ScrollRow({ label, className, style, children }: { label: string | undefined; className: string; style: Record<string, string> | undefined; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollable = useScrollable(ref);
  const stop = scrollable ? scrollStopProps(true, { label: label ?? "Scrollable row" }) : namedGroup(label);
  return (
    <div ref={ref} {...stop} className={cn("outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset", className)} style={style}>
      {children}
    </div>
  );
}

/** A free-layout container: every prop is a named step, so a spec never carries its own CSS. */
export function BoxView({ props, children }: ViewProps<"Box">) {
  const scoped = useContext(ThemeScopeContext);
  const painted = paint(props.surface ?? "none", scoped);
  const className = cn(layoutClass(props), finishClass(props), painted.className);
  const content = painted.inner ? <ThemeScopeContext.Provider value={painted.inner}>{children}</ThemeScopeContext.Provider> : children;
  if (props.overflow === "scroll") return <ScrollRow label={props.label} className={className} style={painted.style}>{content}</ScrollRow>;
  return <div {...namedGroup(props.label)} className={className} style={painted.style}>{content}</div>;
}
