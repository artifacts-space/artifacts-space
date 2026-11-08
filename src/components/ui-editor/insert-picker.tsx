"use client";

import {
  IconAlignLeft,
  IconBadge,
  IconBlockquote,
  IconMarkdown,
  IconCalendar,
  IconCards,
  IconChartBar,
  IconCheckbox,
  IconCode,
  IconColumns,
  IconH1,
  IconH2,
  IconH3,
  IconLayoutBoard,
  IconLayoutList,
  IconLink,
  IconList,
  IconListCheck,
  IconListDetails,
  IconListNumbers,
  IconInfoCircle,
  IconProgress,
  IconSchema,
  IconSection,
  IconSelector,
  IconSeparator,
  IconSlideshow,
  IconAdjustmentsHorizontal,
  IconTable,
  IconTimeline,
  IconToggleRight,
  IconClick,
  IconNumber,
  IconLayoutRows,
  IconStairs,
  type Icon,
} from "@tabler/icons-react";
import { useId, useState, type KeyboardEvent } from "react";

import { Popover, PopoverContent } from "@/components/ui/popover";
import { matchTemplates, type BlockTemplate } from "@/lib/ui/block-templates";
import { cn } from "@/lib/utils";

const icons: Record<string, Icon> = {
  text: IconAlignLeft,
  "heading-1": IconH1,
  "heading-2": IconH2,
  "heading-3": IconH3,
  markdown: IconMarkdown,
  list: IconList,
  "numbered-list": IconListNumbers,
  quote: IconBlockquote,
  callout: IconInfoCircle,
  code: IconCode,
  badge: IconBadge,
  link: IconLink,
  separator: IconSeparator,
  section: IconSection,
  card: IconCards,
  columns: IconColumns,
  row: IconLayoutRows,
  tabs: IconSlideshow,
  accordion: IconLayoutList,
  table: IconTable,
  chart: IconChartBar,
  metric: IconNumber,
  "key-value": IconListDetails,
  progress: IconProgress,
  timeline: IconTimeline,
  diagram: IconSchema,
  steps: IconStairs,
  checklist: IconListCheck,
  board: IconLayoutBoard,
  calendar: IconCalendar,
  checkbox: IconCheckbox,
  select: IconSelector,
  switch: IconToggleRight,
  slider: IconAdjustmentsHorizontal,
  button: IconClick,
};

function nextIndex(key: string, current: number, count: number): number | null {
  if (key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

interface InsertPickerProps {
  /** The element the menu opens beside; null while it is closed. */
  anchor: HTMLElement | null;
  onPick: (template: BlockTemplate) => void;
  onClose: () => void;
}

/** The search field and list inside the open menu. */
function PickerList({ onPick }: { onPick: (template: BlockTemplate) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = matchTemplates(query);
  const current = Math.min(active, Math.max(matches.length - 1, 0));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const moved = matches.length > 0 ? nextIndex(event.key, current, matches.length) : null;
    if (moved !== null) {
      event.preventDefault();
      setActive(moved);
      return;
    }
    const picked = matches[current];
    if (event.key === "Enter" && picked) {
      event.preventDefault();
      onPick(picked);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        autoFocus
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={matches[current] ? `${listId}-${matches[current].id}` : undefined}
        aria-label="Search blocks"
        placeholder="Search blocks"
        className="h-8 w-full rounded-md bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
      {matches.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">No blocks match.</p> : null}
      <div id={listId} role="listbox" aria-label="Blocks" className="flex max-h-72 flex-col overflow-y-auto">
        {matches.map((template, index) => {
          const ItemIcon = icons[template.id] ?? IconAlignLeft;
          return (
            <div
              key={template.id}
              id={`${listId}-${template.id}`}
              role="option"
              aria-selected={index === current}
              onMouseDown={(event) => { event.preventDefault(); }}
              onMouseEnter={() => { setActive(index); }}
              onClick={() => { onPick(template); }}
              className={cn("flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-sm select-none", index === current ? "bg-accent text-accent-foreground" : "text-popover-foreground")}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <ItemIcon aria-hidden className="size-4" />
              </span>
              <span className="flex-1">{template.label}</span>
              <span className="text-xs text-muted-foreground">{template.group}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The block menu opened by "+" or by "/" on an empty line: type to filter,
 * arrows to choose, Enter to add, Escape to close.
 */
export function InsertPicker({ anchor, onPick, onClose }: InsertPickerProps) {
  return (
    <Popover open={anchor !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <PopoverContent anchor={anchor} align="start" className="w-72" aria-label="Add a block">
        {anchor ? <PickerList onPick={onPick} /> : null}
      </PopoverContent>
    </Popover>
  );
}
