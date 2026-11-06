"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";

import { IconButton } from "./icon-button";
import { useCopyToClipboard } from "./use-copy-to-clipboard";

/**
 * An icon-only copy button. Its tooltip and a screen-reader announcement say
 * "Copied" once the value is on the clipboard.
 */
export function CopyIconButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string | undefined }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <>
      <IconButton label={label} tooltip={copied ? "Copied" : label} onClick={() => void copy(value)} className={className}>
        {copied ? <IconCheck /> : <IconCopy />}
      </IconButton>
      <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
    </>
  );
}
