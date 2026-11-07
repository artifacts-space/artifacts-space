"use client";

import { useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { searchTablerIcons, TABLER_PREFIX } from "@/lib/artifact-icons";
import { iconGridMove } from "@/lib/icon-grid";
import { cn } from "@/lib/utils";

import { tablerIconComponents } from "./tabler-icons";

const COLUMNS = 8;

interface TablerTabProps {
  /** The stored icon, to mark the current choice. */
  value: string | null;
  onSelect: (icon: string) => void;
}

/**
 * The Icons tab: the curated Tabler set with search. The grid is one tab
 * stop; arrow keys, Home, and End move inside it, and Down from the search
 * box enters it.
 */
export function TablerTab({ value, onSelect }: TablerTabProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const icons = useMemo(() => searchTablerIcons(query), [query]);
  const activeIndex = Math.min(active, Math.max(0, icons.length - 1));

  function focusCell(index: number) {
    setActive(index);
    cells.current[index]?.focus();
  }

  function onGridKey(event: React.KeyboardEvent, index: number) {
    const next = iconGridMove(index, event.key, COLUMNS, icons.length);
    if (next === null) return;
    event.preventDefault();
    focusCell(next);
  }

  return (
    <div className="flex h-80 flex-col">
      <div className="px-2 pt-2 pb-1">
        <Input
          aria-label="Search icons"
          placeholder="Search icons"
          value={query}
          autoFocus
          className="h-8 sm:text-sm"
          onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" || icons.length === 0) return;
            event.preventDefault();
            focusCell(activeIndex);
          }}
        />
      </div>
      {icons.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No icons match.</p>
      ) : (
        <div role="group" aria-label="Icons" className="grid flex-1 auto-rows-min grid-cols-8 content-start gap-0.5 overflow-y-auto overscroll-contain px-1.5 pt-1 pb-1.5">
          {icons.map((item, index) => {
            const Glyph = tablerIconComponents[item.name];
            const id = `${TABLER_PREFIX}${item.name}`;
            return (
              <button
                key={item.name}
                ref={(node) => { cells.current[index] = node; }}
                type="button"
                aria-label={item.label}
                aria-pressed={id === value}
                title={item.label}
                tabIndex={index === activeIndex ? 0 : -1}
                onKeyDown={(event) => { onGridKey(event, index); }}
                onFocus={() => { setActive(index); }}
                onClick={() => { onSelect(id); }}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  id === value && "bg-muted text-foreground",
                )}
              >
                <Glyph aria-hidden className="size-5" stroke={1.75} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
