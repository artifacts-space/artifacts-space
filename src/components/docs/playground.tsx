"use client";

import { IconAlertTriangle, IconCircleCheck, IconWand } from "@tabler/icons-react";
import { useDeferredValue, useMemo, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { ContentEditor } from "@/components/editor/content-editor";
import { Button } from "@/components/ui/button";
import type { PlaygroundSeed } from "@/lib/docs/playground-seeds";
import { compactJson } from "@/lib/docs/spec-builders";
import type { FileDto } from "@/lib/files/types";
import type { UiSpecIssue } from "@/lib/ui/issues";
import { validateUiSpec } from "@/lib/ui/validate";
import { cn } from "@/lib/utils";

const noFiles: readonly FileDto[] = [];

/** Pretty JSON for valid input, or the text unchanged when it does not parse. */
function prettify(text: string): string {
  try {
    return compactJson(JSON.parse(text) as unknown);
  } catch {
    return text;
  }
}

function SeedPicker({ seeds, active, onPick }: { seeds: PlaygroundSeed[]; active: string | null; onPick: (seed: PlaygroundSeed) => void }) {
  return (
    <div role="group" aria-label="Start from an example" className="flex flex-wrap gap-1.5">
      {seeds.map((seed) => (
        <button
          key={seed.id}
          type="button"
          aria-pressed={active === seed.id}
          onClick={() => { onPick(seed); }}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors",
            active === seed.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            seed.broken && active !== seed.id && "border-dashed",
          )}
        >
          {seed.title}
        </button>
      ))}
    </div>
  );
}

function IssuePanel({ issues, parsed }: { issues: UiSpecIssue[]; parsed: boolean }) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  if (issues.length === 0) {
    return (
      <p role="status" className="flex items-center gap-2 text-md" data-playground-status="valid">
        <IconCircleCheck aria-hidden className="size-4 text-tone-success" /> No issues. This spec would save as it is.
      </p>
    );
  }
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  return (
    <div role="status" data-playground-status={errors > 0 ? "invalid" : "warnings"}>
      <p className="flex items-center gap-2 text-md font-medium">
        <IconAlertTriangle aria-hidden className={cn("size-4", errors > 0 ? "text-tone-danger" : "text-tone-warning")} />
        {errors > 0 ? `${String(errors)} ${errors === 1 ? "error" : "errors"}` : "No errors"}
        {warnings > 0 ? `, ${String(warnings)} ${warnings === 1 ? "warning" : "warnings"}` : ""}
        {parsed ? "" : " · the preview shows the last spec that could be read"}
      </p>
      <ul className="mt-3 space-y-2">
        {sorted.map((issue, index) => (
          <li key={`${issue.code}-${String(index)}`} className="flex gap-3 text-sm leading-6">
            <span className={cn("w-16 shrink-0 font-mono text-xs leading-6", issue.severity === "error" ? "text-tone-danger" : "text-tone-warning")}>{issue.severity}</span>
            <span className="min-w-0 break-words">
              {issue.message}
              <span className="ml-2 font-mono text-xs text-muted-foreground">{issue.code}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The JSON Render playground: the shared content editor with a live preview,
 * and every validation issue under it, as you type. It uses the same
 * validator and renderer as artifact pages. Nothing is saved or sent.
 */
export function Playground({ seeds }: { seeds: PlaygroundSeed[] }) {
  const first = seeds[0];
  const [active, setActive] = useState<string | null>(first?.id ?? null);
  const [text, setText] = useState(() => (first ? compactJson(first.spec) : ""));
  const deferred = useDeferredValue(text);
  const result = useMemo(() => validateUiSpec(deferred), [deferred]);

  function pick(seed: PlaygroundSeed) {
    setActive(seed.id);
    setText(compactJson(seed.spec));
  }

  return (
    <div className="space-y-4" data-playground="">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <SeedPicker seeds={seeds} active={active} onPick={pick} />
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => { setText(prettify(text)); }}>
            <IconWand /> Format
          </Button>
          <CopyButton value={text} label="Copy JSON" size="sm" />
        </div>
      </div>
      <ContentEditor
        kind="ui"
        value={text}
        onChange={(next) => { setText(next); setActive(null); }}
        title="Playground"
        language=""
        files={noFiles}
        label="ui spec JSON"
      />
      <section aria-label="Validation" className="card-surface px-4 py-4 sm:px-5">
        <IssuePanel issues={result.issues} parsed={result.spec !== null} />
      </section>
    </div>
  );
}
