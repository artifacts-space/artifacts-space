"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";

import { IconButton } from "./icon-button";
import { useCopyToClipboard } from "./use-copy-to-clipboard";

interface CopyIconButtonProps {
  value: string;
  label?: string;
  className?: string | undefined;
  /**
   * Speaks "Copied" through a live region kept elsewhere, in place of the
   * button's own. Inside a rich editor's text, pass the editor's
   * (`useEditorAnnounce`): a live region must never sit there
   * (editor-live-region.tsx says why).
   */
  announce?: ((words: string) => void) | undefined;
}

/**
 * An icon-only copy button. Its tooltip and a screen-reader announcement say
 * "Copied" once the value is on the clipboard.
 */
export function CopyIconButton({ value, label = "Copy", className, announce }: CopyIconButtonProps) {
  const { copied, copy } = useCopyToClipboard();
  const onCopy = async () => {
    if (await copy(value)) announce?.("Copied");
  };
  return (
    <>
      <IconButton label={label} tooltip={copied ? "Copied" : label} onClick={() => void onCopy()} className={className}>
        {copied ? <IconCheck /> : <IconCopy />}
      </IconButton>
      {announce ? null : <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>}
    </>
  );
}
