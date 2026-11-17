"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

import { useCopyToClipboard } from "./use-copy-to-clipboard";

/** The one name for a control that copies an artifact's link: the Share banner and dialog, the meta line, and both More menus. */
export const COPY_LINK_LABEL = "Copy link";

/** A button that copies `value`, with an optional text label that turns into "Copied". */
export function CopyButton({
  value,
  label,
  className,
  variant = "outline",
  size,
}: {
  value: string;
  label?: string;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
}) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={() => void copy(value)}>
      {copied ? <IconCheck /> : <IconCopy />}
      {label ? (
        <span>{copied ? "Copied" : label}</span>
      ) : (
        <span className="sr-only">{copied ? "Copied" : "Copy to clipboard"}</span>
      )}
    </Button>
  );
}
