"use client";

import { useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { iconGridMove } from "@/lib/icon-grid";
import { pickerValue, themePresetSummaries, type StoredArtifactTheme } from "@/lib/themes/artifact-theme";
import { DEFAULT_THEME_ID } from "@/lib/themes/presets";
import { presetTheme } from "@/lib/themes/resolve";
import { cn } from "@/lib/utils";

import { ThemeSwatch } from "./theme-swatch";

const COLUMNS = 2;

interface ThemePickerProps {
  /** The stored theme: a preset id, theme JSON, or null. */
  value: StoredArtifactTheme | null;
  /** Called with the chosen preset id, or null for the default look. The picker closes first. */
  onChange: (theme: string | null) => void;
  /** The button that opens the picker, as a Base UI render element. */
  trigger: React.ReactElement;
  disabled?: boolean;
  align?: "start" | "center" | "end";
}

interface SwatchGridProps {
  selected: string;
  onSelect: (presetId: string) => void;
}

/**
 * The presets as one radio group: a single tab stop, arrow keys, Home, and
 * End move between swatches, and Enter or Space picks one.
 */
function SwatchGrid({ selected, onSelect }: SwatchGridProps) {
  const presets = themePresetSummaries();
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = presets.findIndex((preset) => preset.id === selected);
  const [active, setActive] = useState(Math.max(0, selectedIndex));

  function onKey(event: React.KeyboardEvent, index: number) {
    const next = iconGridMove(index, event.key, COLUMNS, presets.length);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    cells.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Artifact theme" className="grid grid-cols-2 gap-2 p-2">
      {presets.map((preset, index) => {
        const theme = presetTheme(preset.id);
        if (!theme) return null;
        const checked = preset.id === selected;
        return (
          <button
            key={preset.id}
            ref={(node) => { cells.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${preset.name}: ${preset.description}`}
            title={preset.description}
            tabIndex={index === active ? 0 : -1}
            autoFocus={index === active}
            onKeyDown={(event) => { onKey(event, index); }}
            onFocus={() => { setActive(index); }}
            onClick={() => { onSelect(preset.id); }}
            data-theme-option={preset.id}
            className={cn(
              "card-nested flex flex-col overflow-hidden rounded-lg text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              checked && "ring-2 ring-foreground/70",
            )}
          >
            <ThemeSwatch theme={theme} />
            <span className="flex flex-col gap-0.5 border-t border-card-edge px-2.5 py-2">
              <span className="text-sm font-medium">{preset.name}</span>
              <span className="truncate text-xs text-muted-foreground">{preset.fonts.heading.family === preset.fonts.body.family ? preset.fonts.body.family : `${preset.fonts.heading.family} · ${preset.fonts.body.family}`}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Picks an artifact's theme from the built-in presets, shown as swatches
 * with each preset's name and fonts. Default means no theme of its own. A
 * theme set as custom JSON (over MCP) shows a note; picking a preset
 * replaces it. Swatches, and so their fonts, load only while it is open.
 */
export function ThemePicker({ value, onChange, trigger, disabled = false, align = "start" }: ThemePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = pickerValue(value);

  function choose(presetId: string) {
    setOpen(false);
    const next = presetId === DEFAULT_THEME_ID ? null : presetId;
    if (next !== value) onChange(next);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} disabled={disabled} />
      <PopoverContent align={align} sideOffset={8} className="w-[calc(100vw-2rem)] p-0 sm:w-[26rem]">
        <div className="border-b px-3 py-2.5">
          <PopoverTitle>Theme</PopoverTitle>
          <p className="text-xs text-muted-foreground">Colors and fonts for this artifact and the page behind it.</p>
        </div>
        {selected === "custom" ? (
          <p role="note" className="border-b px-3 py-2 text-xs text-muted-foreground">This artifact uses a custom theme. Pick a preset to replace it.</p>
        ) : null}
        {open ? <SwatchGrid selected={selected} onSelect={choose} /> : null}
      </PopoverContent>
    </Popover>
  );
}
