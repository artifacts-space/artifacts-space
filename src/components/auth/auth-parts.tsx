"use client";

import { safeNextPath } from "@/lib/safe-next";
import { cn } from "@/lib/utils";

/** Where to land after sign-in, as an absolute URL on this site. */
export function workspaceUrl() {
  const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
  return new URL(next ?? "/app", window.location.origin).href;
}

/** An error inside a sign-in form, announced to screen readers. Renders nothing without a message. */
export function ErrorMessage({ message, className }: { message: string; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm leading-5 text-destructive", className)}>
      {message}
    </p>
  );
}
