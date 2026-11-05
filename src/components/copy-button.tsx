"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function CopyButton({
  value,
  label,
  className,
  variant = "outline",
}: {
  value: string;
  label?: string;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not access the clipboard.");
    }
  }

  return (
    <Button type="button" variant={variant} className={className} onClick={copy}>
      {copied ? <Check className="text-[#72a5ff]" /> : <Copy />}
      {label ? (
        <span>{copied ? "Copied" : label}</span>
      ) : (
        <span className="sr-only">{copied ? "Copied" : "Copy to clipboard"}</span>
      )}
    </Button>
  );
}
