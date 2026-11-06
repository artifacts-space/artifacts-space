"use client";

import { IconCalendarEvent, IconUser } from "@tabler/icons-react";
import { useId, type CSSProperties } from "react";

import { boardLayoutVars } from "@/lib/ui/board-layout";
import { formatShortDate, parseIsoDate } from "@/lib/ui/calendar-dates";
import type { UiProps } from "@/lib/ui/catalog";
import type { Tone } from "@/lib/ui/props/shared";
import { cn } from "@/lib/utils";

import { badgeTone, toneDot } from "./content";
import type { ViewProps } from "./stout";

type Column = UiProps<"Board">["columns"][number];
type BoardCard = Column["cards"][number];

const cardEdge: Record<Tone, string> = {
  neutral: "",
  info: "border-l-tone-info",
  success: "border-l-tone-success",
  warning: "border-l-tone-warning",
  danger: "border-l-tone-danger",
};

function DueDate({ due }: { due: string }) {
  const day = parseIsoDate(due);
  if (day === null) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <IconCalendarEvent aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">Due </span>
      <time dateTime={due}>{formatShortDate(day, true)}</time>
    </span>
  );
}

function CardMeta({ card }: { card: BoardCard }) {
  if (!card.owner && !card.due) return null;
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {card.owner ? (
        <span className="inline-flex min-w-0 items-center gap-1">
          <IconUser aria-hidden className="size-3.5 shrink-0" />
          <span className="sr-only">Owner </span>
          <span className="min-w-0 break-words">{card.owner}</span>
        </span>
      ) : null}
      {card.due ? <DueDate due={card.due} /> : null}
    </p>
  );
}

function Card({ card }: { card: BoardCard }) {
  const badges = card.badges ?? [];
  return (
    <li className={cn("min-w-0 space-y-1.5 rounded-md border bg-background px-3 py-2.5 shadow-xs", card.tone && card.tone !== "neutral" && cn("border-l-2", cardEdge[card.tone]))}>
      <p className="text-[13px] leading-5 font-medium wrap-anywhere">{card.title}</p>
      {card.body ? <p className="text-xs leading-5 whitespace-pre-line text-muted-foreground wrap-anywhere">{card.body}</p> : null}
      {badges.length > 0 ? (
        <ul aria-label="Labels" className="flex min-w-0 flex-wrap gap-1">
          {badges.map((badge, index) => (
            <li key={`${String(index)}-${badge.label}`} className={cn("inline-flex h-5 max-w-full items-center truncate rounded-full border px-2 text-[11px] font-medium", badgeTone[badge.tone ?? "neutral"])}>
              {badge.label}
            </li>
          ))}
        </ul>
      ) : null}
      <CardMeta card={card} />
    </li>
  );
}

function BoardColumn({ column, headingId }: { column: Column; headingId: string }) {
  const count = column.count ?? column.cards.length;
  return (
    <section aria-labelledby={headingId} className="flex w-(--board-column) shrink-0 snap-start flex-col gap-2 rounded-lg border bg-muted/40 p-2">
      <h3 id={headingId} className="flex min-w-0 items-center gap-2 px-1 pt-0.5 text-[13px] font-medium">
        {column.tone ? <span aria-hidden className={cn("size-2 shrink-0 rounded-full", toneDot[column.tone])} /> : null}
        <span className="min-w-0 break-words">{column.title}</span>
        <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground tabular-nums">
          <span className="sr-only">, </span>
          {count.toLocaleString("en-US")}
          <span className="sr-only"> {count === 1 ? "card" : "cards"}</span>
        </span>
      </h3>
      {column.cards.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">No cards</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {column.cards.map((card, index) => <Card key={`${String(index)}-${card.title.slice(0, 20)}`} card={card} />)}
        </ul>
      )}
    </section>
  );
}

/**
 * A read-only status board. Columns share the board's width when they fit
 * at a readable minimum; otherwise they keep a readable width and scroll
 * sideways inside the board, with the next column peeking in under a fade,
 * so the page itself never scrolls sideways. See board-layout.ts.
 */
export function BoardView({ props }: ViewProps<"Board">) {
  const id = useId();
  const name = props.title ?? "Board";
  // Custom properties are not in CSSProperties, so the record needs a cast.
  const layout = boardLayoutVars(props.columns.length) as CSSProperties;
  return (
    <figure className="min-w-0 space-y-2">
      {props.title ? <figcaption className="text-sm font-medium break-words">{props.title}</figcaption> : null}
      <div
        role="region"
        aria-label={name}
        tabIndex={0}
        style={layout}
        className="@container relative flex min-w-0 snap-x snap-proximity items-start gap-(--board-gap) overflow-x-auto overscroll-x-contain rounded-lg pb-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {props.columns.map((column, index) => (
          <BoardColumn key={`${String(index)}-${column.title}`} column={column} headingId={`${id}-column-${String(index)}`} />
        ))}
        {/* Pinned to the scroll edge while columns are hidden past it; zero wide when every column fits. At the end of the scroll it sits in its own gutter, past the last column. */}
        <div aria-hidden className="pointer-events-none sticky right-0 -ml-(--board-gap) w-(--board-fade) shrink-0 self-stretch bg-linear-to-r from-transparent to-background" />
      </div>
    </figure>
  );
}
