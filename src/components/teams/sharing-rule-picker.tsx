"use client";

import { cn } from "@/lib/utils";

// "No approval" comes first: it is the default for new teams, and approval is for sharing outside the team.
const options = [
  { value: false, title: "No approval", detail: "Members share their artifacts with the team right away." },
  { value: true, title: "Admins approve", detail: "An owner or admin approves each artifact before the team sees it." },
] as const;

/** What stays the same whichever option is chosen. Shown under the picker. */
export const sharingRuleFootnote =
  "Either way, everyone in the team edits the team's artifacts directly. Sharing by link or in public needs an owner's or admin's approval, unless someone's role allows it.";

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
            <span className="block text-md font-medium">{option.title}</span>
            <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{option.detail}</span>
          </button>
        );
      })}
    </div>
  );
}
