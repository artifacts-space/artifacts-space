"use client";

import { formatLongDay, isoWallText } from "@/lib/ui/calendar-dates";
import { entryTimeLabel, type AgendaDay, type CalendarEntry } from "@/lib/ui/calendar-model";
import { cn } from "@/lib/utils";

import { toneDot } from "./content";

/** One event in a list: when, a tone dot, the title, and the note. */
export function EntryRow({ entry }: { entry: CalendarEntry }) {
  return (
    <li className="grid min-w-0 gap-x-4 gap-y-0.5 py-2 @sm:grid-cols-[10.5rem_minmax(0,1fr)]">
      <span className="flex min-w-0 items-start gap-2 text-xs leading-5 text-muted-foreground tabular-nums">
        <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", toneDot[entry.tone ?? "neutral"])} />
        <time dateTime={isoWallText({ day: entry.startDay, minute: entry.startMinute })}>{entryTimeLabel(entry)}</time>
      </span>
      <div className="min-w-0 pl-4 @sm:pl-0">
        <p className="text-[13px] leading-5 font-medium wrap-anywhere">{entry.title}</p>
        {entry.note ? <p className="text-xs leading-5 whitespace-pre-line text-muted-foreground wrap-anywhere">{entry.note}</p> : null}
      </div>
    </li>
  );
}

/** Events of one day under a dated heading. */
export function DayEntries({ day, entries, level = 3 }: { day: number; entries: readonly CalendarEntry[]; level?: 3 | 4 }) {
  const Heading = level === 3 ? "h3" : "h4";
  return (
    <>
      <Heading className="pt-2 text-xs font-medium text-muted-foreground">
        <time dateTime={isoWallText({ day, minute: null })}>{formatLongDay(day)}</time>
      </Heading>
      <ul className="min-w-0 divide-y divide-border/60">
        {entries.map((entry) => <EntryRow key={entry.index} entry={entry} />)}
      </ul>
    </>
  );
}

/** The agenda: a list of days, each with its events. */
export function AgendaList({ days, empty, level = 3 }: { days: readonly AgendaDay[]; empty: string; level?: 3 | 4 }) {
  if (days.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <ol aria-label="Events by day" className="@container min-w-0 divide-y border-y">
      {days.map((group) => (
        <li key={group.day} className="min-w-0 pb-1">
          <DayEntries day={group.day} entries={group.entries} level={level} />
        </li>
      ))}
    </ol>
  );
}
