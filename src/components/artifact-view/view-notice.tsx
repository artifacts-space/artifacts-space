import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import type { ReactNode } from "react";

import type { UiSpecIssue } from "@/lib/ui/issues";
import { cn } from "@/lib/utils";

/** A quiet notice above or in place of artifact content. */
export function ViewNotice({ tone = "info", title, children, className }: { tone?: "info" | "warning"; title: string; children?: ReactNode; className?: string }) {
  const Icon = tone === "warning" ? IconAlertTriangle : IconInfoCircle;
  return (
    <div role="note" className={cn("flex gap-2.5 rounded-md border bg-muted/50 px-3.5 py-2.5 text-sm leading-6", className)}>
      <Icon aria-hidden className={cn("mt-1 size-4 shrink-0", tone === "warning" ? "text-tone-warning" : "text-muted-foreground")} />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}

const maxShownIssues = 12;

/** A list of validation issues, errors first, capped so a broken spec cannot flood the page. */
export function IssueList({ issues }: { issues: readonly UiSpecIssue[] }) {
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  const shown = sorted.slice(0, maxShownIssues);
  return (
    <ul className="mt-1.5 space-y-1 break-words">
      {shown.map((issue, index) => (
        <li key={`${issue.code}-${String(index)}`} className="flex gap-2">
          <span className={cn("shrink-0 font-mono text-xs leading-6 uppercase", issue.severity === "error" ? "text-tone-danger" : "text-tone-warning")}>
            {issue.severity === "error" ? "Error" : "Warn"}
          </span>
          <span>{issue.message}</span>
        </li>
      ))}
      {sorted.length > shown.length ? <li>…and {sorted.length - shown.length} more.</li> : null}
    </ul>
  );
}
