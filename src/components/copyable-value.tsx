import { CopyButton } from "@/components/copy-button";

/**
 * A long value people need to copy, such as a secret token or a share link.
 * The value wraps at any character so it never pushes the row wider than its
 * container, and the copy button keeps its size at the end of the row.
 * One click on the value selects all of it, so people can still copy it by
 * hand when the browser blocks clipboard access.
 */
export function CopyableValue({ value, copyLabel = "Copy" }: { value: string; copyLabel?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background/60 p-1.5 pl-3">
      <code className="min-w-0 flex-1 font-mono text-xs leading-5 break-all select-all">{value}</code>
      <CopyButton value={value} label={copyLabel} variant="secondary" size="sm" />
    </div>
  );
}
