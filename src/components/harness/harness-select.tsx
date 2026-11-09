"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { harnessFor, harnesses, isHarnessId, type HarnessId } from "@/lib/harness/harnesses";

import { HarnessIcon } from "./harness-icon";

/** The select's value for "use what was detected". */
const DETECTED = "detected";

/** A harness's icon and name, as a select row or trigger shows it. */
function HarnessOption({ id, suffix }: { id: HarnessId; suffix?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <HarnessIcon id={id} />
      <span className="truncate">{harnessFor(id).name}{suffix}</span>
    </span>
  );
}

interface HarnessSelectProps {
  /** What the connection was detected as. */
  detected: HarnessId;
  /** The person's choice, or null to use what was detected. */
  override: HarnessId | null;
  /** Names the select for screen readers, such as "Agent for Claude Code". */
  label: string;
  /** Saves a choice (null: use detected). Resolves true once saved. */
  onChange: (next: HarnessId | null) => Promise<boolean>;
}

/**
 * Which agent harness a connection is, with a way to change it: "Detected"
 * first, then every known harness with its icon. A change applies to the
 * connection's later saves; artifacts it already saved keep theirs.
 */
export function HarnessSelect({ detected, override, label, onChange }: HarnessSelectProps) {
  const [value, setValue] = useState<HarnessId | null>(override);
  const [saving, setSaving] = useState(false);

  async function change(next: string | null) {
    if (next === null) return;
    const choice = isHarnessId(next) ? next : null;
    if (choice === value) return;
    setSaving(true);
    try {
      if (await onChange(choice)) setValue(choice);
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value={value ?? DETECTED} disabled={saving} onValueChange={(next) => void change(next)}>
      <SelectTrigger size="sm" className="h-8 max-w-full gap-1.5 text-sm" aria-label={label} data-harness-select>
        {saving ? <IconLoader2 aria-hidden className="size-3.5 animate-spin" /> : null}
        <SelectValue>{(selected: string) => (isHarnessId(selected) ? <HarnessOption id={selected} /> : <HarnessOption id={detected} suffix=" (detected)" />)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value={DETECTED}><HarnessOption id={detected} suffix=" (detected)" /></SelectItem>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Change to</SelectLabel>
          {harnesses.map((harness) => <SelectItem key={harness.id} value={harness.id}><HarnessOption id={harness.id} /></SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
