import { capHunks, diffHunks, diffLines, diffStats, type DiffLine } from "@/lib/diff";
import { cn } from "@/lib/utils";
import type { ReviewedFields } from "@/lib/versions/rules";

/** Most diff lines shown for one edit. Longer diffs say how much is hidden. */
const MAX_SHOWN_LINES = 300;

const fieldLabels: { key: Exclude<keyof ReviewedFields, "content" | "metadata">; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "summary", label: "Summary" },
  { key: "kind", label: "Format" },
  { key: "language", label: "Language" },
  { key: "project", label: "Project" },
  { key: "source", label: "Source" },
];

const marks: Record<DiffLine["op"], string> = { same: " ", add: "+", remove: "-" };
const lineStyles: Record<DiffLine["op"], string> = {
  same: "text-muted-foreground",
  add: "bg-diff-added text-diff-added-foreground",
  remove: "bg-diff-removed text-diff-removed-foreground",
};

function empty(value: string) {
  return value === "" ? "(empty)" : value;
}

/** Changed short fields, one row each: old value, then new value. */
function FieldChanges({ before, after }: { before: ReviewedFields; after: ReviewedFields }) {
  const changed = fieldLabels.filter(({ key }) => before[key] !== after[key]);
  const metadataChanged = JSON.stringify(before.metadata) !== JSON.stringify(after.metadata);
  if (changed.length === 0 && !metadataChanged) return null;
  return (
    <dl className="grid gap-1.5 text-sm">
      {changed.map(({ key, label }) => (
        <div key={key} className="grid gap-1 sm:grid-cols-[6rem_1fr]">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">
            <span className="bg-diff-removed text-diff-removed-foreground line-through">{empty(before[key])}</span>{" "}
            <span className="bg-diff-added text-diff-added-foreground">{empty(after[key])}</span>
          </dd>
        </div>
      ))}
      {metadataChanged ? (
        <div className="grid gap-1 sm:grid-cols-[6rem_1fr]">
          <dt className="text-muted-foreground">Metadata</dt>
          <dd>Changed</dd>
        </div>
      ) : null}
    </dl>
  );
}

function lineNumber(value: number | null) {
  return value === null ? "" : String(value);
}

/** The content diff as hunks of numbered lines, capped at MAX_SHOWN_LINES. */
function ContentDiff({ before, after }: { before: string; after: string }) {
  const lines = diffLines(before, after);
  const stats = diffStats(lines);
  if (stats.added === 0 && stats.removed === 0) return <p className="text-sm text-muted-foreground">The content did not change.</p>;
  const { hunks, hidden } = capHunks(diffHunks(lines), MAX_SHOWN_LINES);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        <span className="text-diff-added-foreground">+{stats.added}</span> <span className="text-diff-removed-foreground">-{stats.removed}</span> lines
      </p>
      <div className="overflow-x-auto rounded-md border font-mono text-sm leading-5">
        {hunks.map((hunk, index) => (
          <div key={`${String(index)}-${String(hunk.lines[0]?.oldNumber ?? hunk.lines[0]?.newNumber ?? 0)}`} className="border-b py-1 last:border-b-0">
            {hunk.lines.map((line, lineIndex) => (
              <div key={`${String(line.oldNumber)}-${String(line.newNumber)}-${String(lineIndex)}`} className={cn("grid grid-cols-[2.5rem_2.5rem_1rem_1fr] whitespace-pre", lineStyles[line.op])}>
                <span className="select-none pr-2 text-right opacity-60">{lineNumber(line.oldNumber)}</span>
                <span className="select-none pr-2 text-right opacity-60">{lineNumber(line.newNumber)}</span>
                <span className="select-none" aria-hidden>{marks[line.op]}</span>
                <span className="pr-3"><span className="sr-only">{line.op === "add" ? "Added: " : line.op === "remove" ? "Removed: " : ""}</span>{line.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {hidden > 0 ? <p className="text-sm text-muted-foreground">{hidden} more diff lines are not shown. Open the artifact to read the latest version.</p> : null}
    </div>
  );
}

/**
 * What an edit changes: short fields first, then a line diff of the content.
 * Without an approved version, everything shows as new.
 */
export function EditDiff({ before, after }: { before: ReviewedFields | null; after: ReviewedFields }) {
  if (!before) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">There is no approved version yet, so all of it is new.</p>
        <ContentDiff before="" after={after.content} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <FieldChanges before={before} after={after} />
      <ContentDiff before={before.content} after={after.content} />
    </div>
  );
}
