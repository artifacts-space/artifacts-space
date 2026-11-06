import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

import { CopyIconButton } from "./copy-icon-button";

/**
 * A titled, copyable block of code such as an `mcp.json` snippet. Long lines
 * scroll sideways inside the block instead of widening the page.
 */
export function CodeBlock({
  title,
  value,
  className,
  preClassName,
}: {
  title: string;
  value: string;
  className?: string;
  preClassName?: string;
}) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-md border bg-background/60", className)}>
      <div className="flex h-10 items-center justify-between border-b px-4">
        <span className="font-mono text-xs text-muted-foreground">{title}</span>
        <CopyButton value={value} label="Copy" variant="ghost" size="sm" className="text-xs" />
      </div>
      <pre className={cn("overflow-x-auto p-4 font-mono text-[12.5px] leading-6", preClassName)}><code>{value}</code></pre>
    </div>
  );
}

/**
 * One shell command after a `$` prompt, with an icon copy button. The prompt
 * is not copied, and a long command scrolls sideways inside the block.
 */
export function CommandBlock({ command, copyLabel = "Copy command" }: { command: string; copyLabel?: string }) {
  return (
    <div className="flex min-w-0 items-center rounded-md border bg-background/60">
      <pre className="min-w-0 flex-1 overflow-x-auto py-2.5 pl-3 font-mono text-xs leading-5">
        <code><span aria-hidden="true" className="text-muted-foreground select-none">$ </span>{command}</code>
      </pre>
      <div className="flex shrink-0 items-center px-1">
        <CopyIconButton value={command} label={copyLabel} />
      </div>
    </div>
  );
}
