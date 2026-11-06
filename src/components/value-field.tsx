"use client";

import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useId, useState } from "react";

import { maskSecret } from "@/lib/setup/mask-secret";
import { cn } from "@/lib/utils";

import { CopyIconButton } from "./copy-icon-button";
import { IconButton } from "./icon-button";

/** The eye button that shows or hides a secret value. */
function RevealButton({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <IconButton label={revealed ? "Hide token" : "Show token"} pressed={revealed} onClick={onToggle} className="mx-1">
      {revealed ? <IconEyeOff /> : <IconEye />}
    </IconButton>
  );
}

/**
 * A long value people need to copy, such as a share link or a secret token,
 * on one line that never wraps. A long value scrolls sideways inside the
 * field, so the field never widens its container. A `secret` value is masked
 * until someone presses the eye button. Copy always copies the full value.
 */
export function ValueField({
  value,
  label,
  secret = false,
  copyLabel = "Copy",
}: {
  value: string;
  /** A short mono label above the field, such as an environment variable name. */
  label?: string;
  secret?: boolean;
  copyLabel?: string;
}) {
  const labelId = useId();
  const [revealed, setRevealed] = useState(false);
  const masked = secret && !revealed;
  const groupName = label ? { "aria-labelledby": labelId } : { "aria-label": copyLabel };

  return (
    <div className="grid min-w-0 gap-1.5">
      {label ? <p id={labelId} className="font-mono text-xs text-muted-foreground">{label}</p> : null}
      <div role="group" {...groupName} className="flex h-10 min-w-0 items-center rounded-md border bg-background/60">
        <code
          className={cn(
            "min-w-0 flex-1 overflow-x-auto py-2 pl-3 font-mono text-sm leading-5 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            masked ? "select-none" : "select-all",
          )}
        >
          {masked ? maskSecret(value) : value}
        </code>
        {secret ? <RevealButton revealed={revealed} onToggle={() => { setRevealed((current) => !current); }} /> : <span className="w-2 shrink-0" />}
        <div className="flex h-full shrink-0 items-center border-l px-1">
          <CopyIconButton value={value} label={copyLabel} />
        </div>
      </div>
    </div>
  );
}
