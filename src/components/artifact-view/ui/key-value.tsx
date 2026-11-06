"use client";

import { formatCellValue, missingValue } from "@/lib/ui/number-format";
import type { UiProps } from "@/lib/ui/catalog";
import { cn } from "@/lib/utils";

import { badgeTone } from "./content";
import type { ViewProps } from "./stout";

type Item = UiProps<"KeyValue">["items"][number];

function isNumeric(item: Item) {
  return typeof item.value === "number" && item.format !== undefined && item.format !== "text";
}

function Value({ item, currency }: { item: Item; currency: string }) {
  const text = formatCellValue(item.value, item.format ?? "number", currency);
  if (text === missingValue) return <span className="text-muted-foreground">{text}</span>;
  if (item.tone) {
    return <span className={cn("inline-flex min-h-5 max-w-full items-center rounded-full border px-2 text-xs font-medium break-words", badgeTone[item.tone])}>{text}</span>;
  }
  return <span className={cn(item.mono ? "font-mono text-[12.5px]" : undefined, isNumeric(item) || typeof item.value === "number" ? "tabular-nums" : undefined)}>{text}</span>;
}

/** Label and value pairs as a description list: label on the left, value beside it. */
export function KeyValueView({ props }: ViewProps<"KeyValue">) {
  const currency = props.currency ?? "USD";
  const twoColumns = props.columns === 2;
  return (
    <figure className="min-w-0 space-y-2">
      {props.title ? <figcaption className="text-sm font-medium break-words">{props.title}</figcaption> : null}
      {props.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No details yet.</p>
      ) : (
        <dl className={cn("grid min-w-0 gap-x-8 border-t", twoColumns && "md:grid-cols-2")}>
          {props.items.map((item, index) => (
            <div key={`${String(index)}-${item.label}`} className="flex min-w-0 items-baseline gap-4 border-b py-2 text-[13px] leading-6">
              <dt className="w-2/5 max-w-56 shrink-0 break-words text-muted-foreground">{item.label}</dt>
              <dd className="min-w-0 flex-1 wrap-anywhere whitespace-pre-line">
                <Value item={item} currency={currency} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </figure>
  );
}
