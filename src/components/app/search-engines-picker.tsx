"use client";

import { Switch } from "@/components/ui/switch";

import type { SearchSwitchState } from "./search-options";

interface SearchEnginesPickerProps {
  state: SearchSwitchState;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** "Show in search engines" under the Public choice, with one sentence on what it does. */
export function SearchEnginesPicker({ state, checked, onChange }: SearchEnginesPickerProps) {
  if (state === "hidden") return null;
  const waiting = state === "after-approval";
  return (
    <label className="flex items-start justify-between gap-4 text-sm">
      <span className="flex flex-col gap-1">
        <span className="text-foreground">Show in search engines</span>
        <span className="leading-5 text-muted-foreground">
          {waiting
            ? "You can let Google and other search engines list this page once public sharing is approved."
            : "When on, Google and other search engines can list this page."}
        </span>
      </span>
      {/* -mt-0.5 lifts the 24px switch onto the label's 20px (text-sm) first line. */}
      <Switch className="-mt-0.5" checked={checked && !waiting} disabled={waiting} onCheckedChange={(next) => { onChange(next); }} aria-label="Show in search engines" />
    </label>
  );
}
