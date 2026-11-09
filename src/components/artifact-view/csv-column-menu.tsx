"use client";

import { IconArrowDown, IconArrowUp, IconCheck, IconX } from "@tabler/icons-react";
import { type RefObject, useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import type { ColumnType } from "@/lib/csv-values";
import { type ColumnFilter, emptyColumnFilter, isFilterActive, type SortDirection } from "@/lib/csv-view-rules";

import { type ColumnLayoutProps, ColumnLayoutOptions } from "./column-layout-options";

const sortLabels: Record<ColumnType, Record<SortDirection, string>> = {
  number: { asc: "Sort smallest first", desc: "Sort largest first" },
  date: { asc: "Sort oldest first", desc: "Sort newest first" },
  text: { asc: "Sort A to Z", desc: "Sort Z to A" },
};

const typeLabels: Record<ColumnType, string> = { number: "Numbers", date: "Dates", text: "Text" };

export interface CsvColumnMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The header cell the menu opens from. */
  anchor: () => Element | null;
  /** Where focus goes when the menu closes. */
  returnFocus: RefObject<HTMLElement | null>;
  name: string;
  type: ColumnType;
  /** This column's sort, or null when the view is not sorted by it. */
  sort: SortDirection | null;
  onSort: (direction: SortDirection | null) => void;
  filter: ColumnFilter;
  onFilterChange: (filter: ColumnFilter) => void;
  /** Move and fit options; a reader's moves change only their own view. */
  layout: ColumnLayoutProps;
}

/**
 * A column's options: sort either way, and filter by text or, for numbers,
 * by a range. Changes apply as you type and only change this view.
 */
export function CsvColumnMenu(props: CsvColumnMenuProps) {
  const { type, sort, filter, onFilterChange } = props;
  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverContent anchor={props.anchor} finalFocus={props.returnFocus} className="w-72 p-1.5">
        <div className="flex items-baseline gap-2 px-2 pt-1 pb-2">
          <PopoverTitle className="min-w-0 truncate">{props.name || "Untitled column"}</PopoverTitle>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{typeLabels[type]}</span>
        </div>
        <SortOption icon={<IconArrowUp />} label={sortLabels[type].asc} selected={sort === "asc"} onClick={() => { props.onSort(sort === "asc" ? null : "asc"); }} />
        <SortOption icon={<IconArrowDown />} label={sortLabels[type].desc} selected={sort === "desc"} onClick={() => { props.onSort(sort === "desc" ? null : "desc"); }} />
        <Separator className="my-1.5" />
        <ColumnLayoutOptions {...props.layout} />
        <Separator className="my-1.5" />
        <form noValidate onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); props.onOpenChange(false); }} className="space-y-2 px-2 pt-1 pb-1.5">
          {type === "number" ? <RangeFields filter={filter} onChange={onFilterChange} /> : <ContainsField filter={filter} onChange={onFilterChange} />}
          {isFilterActive(filter) ? (
            <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => { onFilterChange(emptyColumnFilter); }}>
              <IconX /> Clear filter
            </Button>
          ) : null}
        </form>
      </PopoverContent>
    </Popover>
  );
}

function SortOption({ icon, label, selected, onClick }: { icon: React.ReactNode; label: string; selected: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" aria-pressed={selected} onClick={onClick} className="w-full justify-start font-normal">
      {icon}
      {label}
      {selected ? <IconCheck aria-label="On" className="ml-auto" /> : null}
    </Button>
  );
}

function ContainsField({ filter, onChange }: { filter: ColumnFilter; onChange: (filter: ColumnFilter) => void }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">Show rows that contain</Label>
      <Input id={id} value={filter.contains} placeholder="Type to filter" autoComplete="off" onChange={(event) => { onChange({ ...filter, contains: event.target.value }); }} />
    </div>
  );
}

function RangeFields({ filter, onChange }: { filter: ColumnFilter; onChange: (filter: ColumnFilter) => void }) {
  const minId = useId();
  const maxId = useId();
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Show rows between</legend>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={minId} className="sr-only">Smallest value</Label>
          <Input id={minId} inputMode="decimal" value={filter.min} placeholder="Min" autoComplete="off" onChange={(event) => { onChange({ ...filter, min: event.target.value }); }} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={maxId} className="sr-only">Largest value</Label>
          <Input id={maxId} inputMode="decimal" value={filter.max} placeholder="Max" autoComplete="off" onChange={(event) => { onChange({ ...filter, max: event.target.value }); }} />
        </div>
      </div>
    </fieldset>
  );
}
