"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

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
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => { setCopied(false); }, 1800);
    } catch {
      toast.error("Could not access the clipboard.");
    }
  }

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={() => void copy()}>
      {copied ? <IconCheck /> : <IconCopy />}
      {label ? (
        <span>{copied ? "Copied" : label}</span>
      ) : (
        <span className="sr-only">{copied ? "Copied" : "Copy to clipboard"}</span>
      )}
    </Button>
  );
}
