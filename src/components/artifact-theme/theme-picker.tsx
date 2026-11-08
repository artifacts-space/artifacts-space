"use client";

import { Fragment, useMemo, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { iconGridMove } from "@/lib/icon-grid";
import type { StoredArtifactTheme } from "@/lib/themes/artifact-theme";
import { noThemeChoices, type ThemeChoices } from "@/lib/themes/theme-choice-types";
import { cn } from "@/lib/utils";

import { selectedOptionKey, themeOptions, type ThemeOption } from "./theme-options";
import { ThemeSwatch } from "./theme-swatch";

const COLUMNS = 2;

interface ThemePickerProps {
  /** The stored theme: a preset id, a team preset id, theme JSON, or null. */
  value: StoredArtifactTheme | null;
  /** Called with the chosen preset id, or null for no theme of its own. The picker closes first. */
  onChange: (theme: string | null) => void;
  /** The button that opens the picker, as a Base UI render element. */
  trigger: React.ReactElement;
  /** Team presets the viewer may use, and the team default the artifact inherits. */
  choices?: ThemeChoices;
  disabled?: boolean;
  align?: "start" | "center" | "end";
}

interface SwatchGridProps {
  options: readonly ThemeOption[];
  selected: string;
  onSelect: (option: ThemeOption) => void;
}

/**
 * Every option as one radio group: a single tab stop, arrow keys, Home, and
 * End move between swatches, and Enter or Space picks one. Group headings
 * (Team default, each team, Built-in) span the grid.
 */
function SwatchGrid({ options, selected, onSelect }: SwatchGridProps) {
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.key === selected);
  const [active, setActive] = useState(Math.max(0, selectedIndex));

  function onKey(event: React.KeyboardEvent, index: number) {
    const next = iconGridMove(index, event.key, COLUMNS, options.length);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    cells.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Artifact theme" className="grid max-h-[min(60dvh,32rem)] grid-cols-2 gap-2 overflow-y-auto overscroll-contain p-2">
      {options.map((option, index) => {
        const checked = option.key === selected;
        return (
          <Fragment key={option.key}>
            {option.group ? <p aria-hidden className="col-span-2 px-1 pt-1 text-xs font-medium text-muted-foreground">{option.group}</p> : null}
            <button
              ref={(node) => { cells.current[index] = node; }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.label}
              title={option.label}
              tabIndex={index === active ? 0 : -1}
              autoFocus={index === active}
              onKeyDown={(event) => { onKey(event, index); }}
              onFocus={() => { setActive(index); }}
              onClick={() => { onSelect(option); }}
              data-theme-option={option.key}
              className={cn(
                "card-nested flex flex-col overflow-hidden rounded-lg text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                checked && "ring-2 ring-foreground/70",
              )}
            >
              <ThemeSwatch theme={option.theme} />
              <span className="flex flex-col gap-0.5 border-t border-card-edge px-2.5 py-2">
                <span className="truncate text-sm font-medium">{option.name}</span>
                <span className="truncate text-xs text-muted-foreground">{option.detail}</span>
              </span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

const notes: Record<string, string> = {
  custom: "This artifact uses a custom theme. Pick a preset to replace it.",
  missing: "This artifact's team preset is not available here, so it shows the team default or the site default. Pick another to replace it.",
};

/**
 * Picks an artifact's theme: the team default it inherits (when its team has
 * one), the presets of the viewer's team, and the built-ins, as swatches
 * with names and fonts. Swatches, and so their fonts, load only while it is open.
 */
export function ThemePicker({ value, onChange, trigger, choices = noThemeChoices, disabled = false, align = "start" }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => themeOptions(choices), [choices]);
  const selected = selectedOptionKey(value, options);
  const note = notes[selected];

  function choose(option: ThemeOption) {
    setOpen(false);
    if (option.value !== value) onChange(option.value);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} disabled={disabled} />
      <PopoverContent align={align} sideOffset={8} className="w-[calc(100vw-2rem)] p-0 sm:w-[26rem]">
        <div className="border-b px-3 py-2.5">
          <PopoverTitle>Theme</PopoverTitle>
          <p className="text-xs text-muted-foreground">Colors and fonts for this artifact and the page behind it.</p>
        </div>
        {note ? <p role="note" className="border-b px-3 py-2 text-xs text-muted-foreground">{note}</p> : null}
        {open ? <SwatchGrid options={options} selected={selected} onSelect={choose} /> : null}
      </PopoverContent>
    </Popover>
  );
}
