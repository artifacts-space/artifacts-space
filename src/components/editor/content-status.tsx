"use client";

import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";
import { useDeferredValue } from "react";

import { validateArtifactContent } from "@/lib/artifact-content";
import { formatInfo } from "@/lib/artifact-formats";
import type { ArtifactKind } from "@/lib/artifact-types";
import { cn } from "@/lib/utils";

/** Formats whose content has rules a person can break while typing. */
const checkedKinds: ReadonlySet<string> = new Set(["json", "csv", "svg", "mermaid", "ui"]);

/** Whether the editor checks this format as you type. */
export function isCheckedKind(kind: ArtifactKind): boolean {
  return checkedKinds.has(kind);
}

/** A one-line check of the content against its format, shown under an editor. */
export function ContentStatus({ kind, content, className }: { kind: ArtifactKind; content: string; className?: string }) {
  const deferred = useDeferredValue(content);
  if (!checkedKinds.has(kind) || !deferred.trim()) return null;
  const result = validateArtifactContent(kind, deferred);
  const label = formatInfo[kind].label;
  const firstError = result.issues.find((issue) => issue.severity === "error");
  return (
    <div role="status" className={cn("flex items-start gap-2 border-t bg-background/60 px-5 py-2 text-sm text-muted-foreground sm:px-7", className)}>
      {firstError ? (
        <>
          <IconAlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-tone-warning" />
          <span className="min-w-0 break-words">
            {firstError.message}
            {result.issues.length > 1 ? ` (${String(result.issues.length - 1)} more)` : ""}
          </span>
        </>
      ) : (
        <>
          <IconCircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-tone-success" />
          <span>Valid {label}. It is ready to save.</span>
        </>
      )}
    </div>
  );
}
