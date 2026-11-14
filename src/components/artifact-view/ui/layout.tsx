"use client";

import { Children, type ReactNode } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Gap } from "@/lib/ui/props/shared";
import { hasTitleText, titleOr } from "@/lib/ui/title-rules";
import { cn } from "@/lib/utils";

import type { ViewProps } from "./stout";
import { TabStrip } from "./tab-strip";

const gapClass: Record<Gap, string> = { none: "gap-0", sm: "gap-2", md: "gap-4", lg: "gap-6" };

const alignClass = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" } as const;

const gridColumns = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
} as const;

function Empty({ what }: { what: string }) {
  return <p className="text-sm text-muted-foreground">No {what} yet.</p>;
}

function hasChildren(children: ReactNode) {
  return Children.count(children) > 0;
}

export function SectionView({ props, children }: ViewProps<"Section">) {
  return (
    <section className="min-w-0 space-y-4">
      {hasTitleText(props.title) || hasTitleText(props.description) ? (
        <header className="space-y-1">
          {hasTitleText(props.title) ? <h2 className="text-lg font-medium tracking-[-0.01em] break-words">{props.title}</h2> : null}
          {hasTitleText(props.description) ? <p className="text-md leading-6 text-muted-foreground break-words">{props.description}</p> : null}
        </header>
      ) : null}
      <div className="flex min-w-0 flex-col gap-4">{hasChildren(children) ? children : <Empty what="content" />}</div>
    </section>
  );
}

export function StackView({ props, children }: ViewProps<"Stack">) {
  const horizontal = props.direction === "horizontal";
  return (
    <div
      className={cn(
        "flex min-w-0",
        horizontal ? "flex-row flex-wrap" : "flex-col",
        gapClass[props.gap ?? "md"],
        props.align ? alignClass[props.align] : horizontal ? "items-center" : "items-stretch",
      )}
    >
      {children}
    </div>
  );
}

export function GridView({ props, children }: ViewProps<"Grid">) {
  const columns = (props.columns ?? 2) as keyof typeof gridColumns;
  return <div className={cn("grid min-w-0", gridColumns[columns], gapClass[props.gap ?? "md"])}>{children}</div>;
}

export function CardView({ props, children }: ViewProps<"Card">) {
  return (
    <div className="card-surface flex min-w-0 flex-col gap-3 p-4 sm:p-5">
      {hasTitleText(props.title) || hasTitleText(props.description) ? (
        <div className="space-y-1">
          {hasTitleText(props.title) ? <h3 className="text-base font-medium break-words">{props.title}</h3> : null}
          {hasTitleText(props.description) ? <p className="text-sm leading-5 text-muted-foreground break-words">{props.description}</p> : null}
        </div>
      ) : null}
      {hasChildren(children) ? <div className="flex min-w-0 flex-col gap-3">{children}</div> : null}
    </div>
  );
}

export function TabsView({ props, children }: ViewProps<"Tabs">) {
  const panels = Children.toArray(children);
  const defaultIndex = Math.min(props.defaultIndex ?? 0, props.tabs.length - 1);
  return (
    <Tabs defaultValue={defaultIndex} className="min-w-0">
      <TabStrip className="-mx-1 px-1 pb-1">
        {/* Each tab is as wide as its label (flex-none), so no label is ever cut off; the strip scrolls when they do not fit. */}
        <TabsList variant="line" className="w-max">
          {props.tabs.map((tab, index) => (
            <TabsTrigger key={`${tab.label}-${String(index)}`} value={index} className="flex-none">
              {titleOr(tab.label, `Tab ${String(index + 1)}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </TabStrip>
      {props.tabs.map((tab, index) => (
        <TabsContent key={`${tab.label}-${String(index)}`} value={index} className="min-w-0 pt-3">
          {panels[index] ?? <Empty what="content in this tab" />}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function AccordionView({ props, children }: ViewProps<"Accordion">) {
  const panels = Children.toArray(children);
  return (
    <Accordion defaultValue={props.openFirst ? [0] : []} multiple className="min-w-0 rounded-lg border bg-card px-4 shadow-xs">
      {props.items.map((item, index) => (
        <AccordionItem key={`${item.title}-${String(index)}`} value={index}>
          <AccordionTrigger className="min-w-0 break-words">{titleOr(item.title, `Item ${String(index + 1)}`)}</AccordionTrigger>
          <AccordionContent>{panels[index] ?? <Empty what="content here" />}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function SeparatorView({ props }: ViewProps<"Separator">) {
  if (!hasTitleText(props.label)) return <hr className="my-2 border-border" />;
  return (
    <div role="separator" aria-label={props.label} className="my-2 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <span className="max-w-[60%] truncate">{props.label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
