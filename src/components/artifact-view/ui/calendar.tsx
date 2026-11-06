"use client";

import { agendaDays, calendarEntries } from "@/lib/ui/calendar-model";

import { AgendaList } from "./calendar-agenda";
import { MonthCalendar } from "./calendar-month";
import type { ViewProps } from "./stout";

/**
 * Dated events as an agenda (default) or a month grid. Dates and times show
 * as written, or in the spec's `timeZone`; the viewer's zone is never used,
 * so the server and the browser render the same days.
 */
export function CalendarView({ props }: ViewProps<"Calendar">) {
  const entries = calendarEntries(props.events, props.timeZone);
  const timed = entries.some((entry) => !entry.allDay);
  return (
    <figure className="min-w-0 space-y-3">
      {props.title ? <figcaption className="text-md font-medium break-words">{props.title}</figcaption> : null}
      {props.view === "month" ? (
        <MonthCalendar entries={entries} month={props.month} weekStart={props.weekStart === "monday" ? 1 : 0} />
      ) : (
        <AgendaList days={agendaDays(entries)} empty="No events yet." />
      )}
      {props.timeZone && timed ? <p className="text-xs text-muted-foreground">Times in {props.timeZone.replaceAll("_", " ")}.</p> : null}
    </figure>
  );
}
