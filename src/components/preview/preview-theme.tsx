"use client";

import { createContext, startTransition, useContext, useMemo, useState, type ReactNode } from "react";

import type { ParsedPreset } from "@/lib/themes/resolve";
import type { Theme } from "@/lib/themes/schema";
import { cn } from "@/lib/utils";

interface PreviewThemeValue {
  presets: readonly ParsedPreset[];
  selected: ParsedPreset | undefined;
  select: (id: string) => void;
}

const PreviewThemeContext = createContext<PreviewThemeValue | null>(null);

/**
 * Holds the preset the /preview page shows. The presets come from the
 * server, already validated, so the page stays static and the switch is
 * client state only.
 */
export function PreviewThemeProvider({ presets, children }: { presets: readonly ParsedPreset[]; children: ReactNode }) {
  const [selectedId, setSelectedId] = useState(presets[0]?.id ?? "default");
  const value = useMemo<PreviewThemeValue>(
    () => ({
      presets,
      selected: presets.find((preset) => preset.id === selectedId),
      // A transition lets React wait for a new face's stylesheet before it swaps the panels.
      select: (id) => { startTransition(() => { setSelectedId(id); }); },
    }),
    [presets, selectedId],
  );
  return <PreviewThemeContext.Provider value={value}>{children}</PreviewThemeContext.Provider>;
}

/** The theme every preview panel renders with, or null for the site default. */
export function usePreviewTheme(): Theme | null {
  return useContext(PreviewThemeContext)?.selected?.theme ?? null;
}

/** The row of preset buttons at the top of /preview, with a line about the chosen one. */
export function PreviewThemeSwitcher() {
  const context = useContext(PreviewThemeContext);
  if (!context) return null;
  const { presets, selected, select } = context;
  return (
    <div className="space-y-2" role="group" aria-labelledby="preview-theme-label">
      <p id="preview-theme-label" className="text-sm font-medium">Theme</p>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={preset.id === selected?.id}
            data-theme-preset={preset.id}
            onClick={() => { select(preset.id); }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              preset.id === selected?.id ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {preset.name}
          </button>
        ))}
      </div>
      {selected ? <p className="text-sm text-muted-foreground" aria-live="polite">{selected.description}</p> : null}
    </div>
  );
}
