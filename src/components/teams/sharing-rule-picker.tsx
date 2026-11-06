"use client";

import { cn } from "@/lib/utils";

const options = [
  { value: true, title: "Admins approve", detail: "An owner or admin approves each artifact before the team sees it." },
  { value: false, title: "No approval", detail: "Members share with the team right away." },
] as const;

/** Two-choice control for a team's sharing rule. */
export function SharingRulePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Sharing with the team" className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.title}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => { onChange(option.value); }}
            className={cn(
              "rounded-md border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              selected ? "border-foreground bg-muted" : "hover:bg-muted/60",
            )}
          >
            <span className="block text-[13px] font-medium">{option.title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{option.detail}</span>
          </button>
        );
      })}
    </div>
  );
}
