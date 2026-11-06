"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

import { useCopyToClipboard } from "./use-copy-to-clipboard";

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
