"use client";

import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { dayParts, firstDayOfMonth, formatClock, formatLongDay, formatMonth, lastDayOfMonth, monthOfDay, weekdayNames } from "@/lib/ui/calendar-dates";
import { agendaDays, entriesByDay, monthRange, monthWeeks, type CalendarEntry } from "@/lib/ui/calendar-model";
import { cn } from "@/lib/utils";

import { AgendaList, DayEntries } from "./calendar-agenda";
import { badgeTone } from "./content";

/** Most events a day cell lists before it shows "+N more". */
const cellLimit = 3;

function EventPill({ entry }: { entry: CalendarEntry }) {
  const time = entry.allDay || entry.startMinute === null ? null : formatClock(entry.startMinute);
  return (
    <li title={entry.title} className={cn("truncate rounded-sm border px-1 text-xs leading-4", badgeTone[entry.tone ?? "neutral"])}>
      {time ? <span className="mr-1 opacity-75 tabular-nums">{time}</span> : null}
      {entry.title}
    </li>
  );
}

interface CellProps {
  day: number;
  inMonth: boolean;
  entries: readonly CalendarEntry[];
  selected: boolean;
  panelId: string;
  onSelect: (day: number) => void;
}

function DayCell({ day, inMonth, entries, selected, panelId, onSelect }: CellProps) {
  const shown = entries.length > cellLimit ? entries.slice(0, cellLimit - 1) : entries;
  const hidden = entries.length - shown.length;
  return (
    <td className={cn("h-24 min-w-0 border p-1 align-top", !inMonth && "bg-muted/40 text-muted-foreground")}>
      <div className="mb-0.5 text-xs tabular-nums">
        <span aria-hidden>{dayParts(day).date}</span>
        <span className="sr-only">{formatLongDay(day)}</span>
      </div>
      {shown.length > 0 ? <ul className="min-w-0 space-y-0.5">{shown.map((entry) => <EventPill key={entry.index} entry={entry} />)}</ul> : null}
      {hidden > 0 ? (
        <button
          type="button"
          aria-expanded={selected}
          aria-controls={panelId}
          onClick={() => { onSelect(day); }}
          className="mt-0.5 rounded-sm px-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          +{hidden} more
        </button>
      ) : null}
    </td>
  );
}

function weekdayOrder(weekStart: 0 | 1) {
  return Array.from({ length: 7 }, (_, index) => weekdayNames[(index + weekStart) % 7] ?? "");
}

interface GridProps {
  month: number;
  weekStart: 0 | 1;
  entries: readonly CalendarEntry[];
  selected: number | null;
  panelId: string;
  onSelect: (day: number | null) => void;
}

function MonthGrid({ month, weekStart, entries, selected, panelId, onSelect }: GridProps) {
  const weeks = monthWeeks(month, weekStart);
  const from = weeks[0]?.[0] ?? firstDayOfMonth(month);
  const to = weeks.at(-1)?.[6] ?? lastDayOfMonth(month);
  const byDay = entriesByDay(entries, from, to);
  const selectedEntries = selected === null ? [] : (byDay.get(selected) ?? []);
  return (
    <div className="space-y-3">
      {/* The frame draws the outer edge; border-hidden drops the cells' own outer borders. */}
      <div className="overflow-hidden rounded-md border bg-card shadow-xs">
        <table className="w-full table-fixed border-collapse border-hidden">
          <caption className="sr-only">{formatMonth(month)}</caption>
          <thead>
            <tr>
              {weekdayOrder(weekStart).map((name) => <th key={name} scope="col" abbr={name} className="px-1 py-1.5 text-left text-xs font-medium text-muted-foreground">{name.slice(0, 3)}</th>)}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]}>
                {week.map((day) => <DayCell key={day} day={day} inMonth={monthOfDay(day) === month} entries={byDay.get(day) ?? []} selected={selected === day} panelId={panelId} onSelect={onSelect} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section id={panelId} aria-label={selected === null ? "Selected day" : `Events on ${formatLongDay(selected)}`} hidden={selected === null} className="min-w-0 rounded-md border bg-card px-3 pb-1 shadow-xs">
        {selected === null ? null : (
          <div className="@container relative">
            <Button variant="ghost" size="icon-xs" aria-label="Close day" className="absolute top-1.5 right-0" onClick={() => { onSelect(null); }}>
              <IconX />
            </Button>
            <DayEntries day={selected} entries={selectedEntries} level={4} />
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * A month grid with previous and next buttons. Containers narrower than
 * 36rem (phones, half-width grid columns) show the same month as a list.
 */
export function MonthCalendar({ entries, month, weekStart }: { entries: readonly CalendarEntry[]; month: string | undefined; weekStart: 0 | 1 }) {
  const range = monthRange(entries, month);
  const [shown, setShown] = useState(range?.initial ?? 0);
  const [selected, setSelected] = useState<number | null>(null);
  const panelId = useId();
  if (!range) return <p className="text-sm text-muted-foreground">No events yet.</p>;
  const current = Math.min(Math.max(shown, range.first), range.last);
  const go = (step: number) => { setShown(current + step); setSelected(null); };
  return (
    <div className="@container min-w-0 space-y-2">
      <div className="flex items-center gap-2">
        <h3 aria-live="polite" className="text-md font-medium">{formatMonth(current)}</h3>
        <div className="ml-auto flex gap-1">
          <Button variant="outline" size="icon-xs" aria-label="Previous month" disabled={current <= range.first} onClick={() => { go(-1); }}><IconChevronLeft /></Button>
          <Button variant="outline" size="icon-xs" aria-label="Next month" disabled={current >= range.last} onClick={() => { go(1); }}><IconChevronRight /></Button>
        </div>
      </div>
      <div className="hidden @xl:block">
        <MonthGrid month={current} weekStart={weekStart} entries={entries} selected={selected} panelId={panelId} onSelect={setSelected} />
      </div>
      <div className="@xl:hidden">
        <AgendaList days={agendaDays(entries, { from: firstDayOfMonth(current), to: lastDayOfMonth(current) })} empty="No events this month." level={4} />
      </div>
    </div>
  );
}
