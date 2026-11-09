"use client";

import { IconRobot } from "@tabler/icons-react";

import { DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import type { ArtifactHarnessDto } from "@/lib/artifact-types";
import { harnessFor, harnesses, isHarnessId } from "@/lib/harness/harnesses";

import { HarnessIcon } from "./harness-icon";
import type { HarnessControl } from "./use-artifact-harness";

/** The radio value for "use what its last agent save recorded". */
const DETECTED = "detected";

/** The first choice: what an agent save recorded, or none for an artifact no agent saved. */
function detectedLabel(harness: ArtifactHarnessDto | null): string {
  const stamped = harness?.stamped;
  return stamped ? `${harnessFor(stamped).name} (detected)` : "None";
}

/**
 * "Made with" in an artifact's More menu: the agent harness it shows, and a
 * way to change it when detection got it wrong. For people who may edit it.
 * Changing it files no version.
 */
export function HarnessMenu({ control }: { control: HarnessControl }) {
  const { harness, pending, onChange } = control;
  const value = harness?.overridden ? harness.id : DETECTED;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="py-2" disabled={pending}>
        {harness ? <HarnessIcon id={harness.id} className="size-4" /> : <IconRobot aria-hidden />} Made with
        {/* The icon is decorative, so screen readers hear the current agent here. */}
        <span className="sr-only">: {harness ? harnessFor(harness.id).name : "no agent"}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 w-52 overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={(next: string) => { onChange(isHarnessId(next) ? next : null); }}>
          <DropdownMenuRadioItem value={DETECTED} disabled={pending}>{detectedLabel(harness)}</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {harnesses.map((item) => (
            <DropdownMenuRadioItem key={item.id} value={item.id} disabled={pending}>
              <HarnessIcon id={item.id} /> {item.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
