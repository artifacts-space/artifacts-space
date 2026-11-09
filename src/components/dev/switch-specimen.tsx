"use client";

import { useState } from "react";

import { ThemeScope } from "@/components/artifact-view/theme-scope";
import { Switch } from "@/components/ui/switch";
import { presetTheme } from "@/lib/themes/resolve";

interface SwitchRow {
  label: string;
  initial: boolean;
  disabled?: boolean;
  size?: "sm" | "default";
}

const rows: readonly SwitchRow[] = [
  { label: "On", initial: true },
  { label: "Off", initial: false },
  { label: "On, disabled", initial: true, disabled: true },
  { label: "Off, disabled", initial: false, disabled: true },
  { label: "Small, on", initial: true, size: "sm" },
  { label: "Small, off", initial: false, size: "sm" },
];

function SwitchRowView({ row }: { row: SwitchRow }) {
  const [checked, setChecked] = useState(row.initial);
  return (
    <div className="flex items-center justify-between gap-4 border-b px-4 py-3 text-sm last:border-b-0">
      <span>{row.label}</span>
      <Switch checked={checked} onCheckedChange={setChecked} disabled={row.disabled ?? false} size={row.size ?? "default"} aria-label={row.label} />
    </div>
  );
}

/** Every switch state on a card, in the Default look and in Ocean, for the gallery and its e2e test. */
export function SwitchSpecimen() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(["default", "ocean"] as const).map((themeId) => (
        <ThemeScope key={themeId} theme={presetTheme(themeId) ?? null} className="rounded-md bg-background p-3 text-foreground" data-switch-specimen={themeId}>
          <div className="card-surface">
            {rows.map((row) => <SwitchRowView key={row.label} row={row} />)}
          </div>
        </ThemeScope>
      ))}
    </div>
  );
}
