"use client";

import { IconAlertTriangle, IconCircleCheck, IconLoader2, IconRefresh, IconX } from "@tabler/icons-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/files/config";
import { pathSuggestion, publishButtonWords } from "@/lib/page-files/batch-rules";
import type { HeldPageFile } from "@/lib/page-files/publish-rules";
import { cn } from "@/lib/utils";

import type { PageBatch, PageRow } from "./use-page-batch";

/** What a row says about its upload. */
function stageWords(row: PageRow): string {
  if (row.stage === "failed") return row.error ?? "The upload failed.";
  if (row.stage === "sending") return `${formatBytes(row.file.size)} · ${String(row.progress)}%`;
  if (row.stage === "checking") return "Checking…";
  if (row.stage === "ready") return `${formatBytes(row.file.size)} · Ready`;
  return `${formatBytes(row.file.size)} · Waiting`;
}

function StageIcon({ row, problem }: { row: PageRow; problem: boolean }) {
  if (problem || row.stage === "failed") return <IconAlertTriangle aria-hidden className="size-4 shrink-0 text-tone-danger" />;
  if (row.stage === "ready") return <IconCircleCheck aria-hidden className="size-4 shrink-0 text-tone-success" />;
  return <IconLoader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />;
}

interface PathFixProps {
  row: PageRow;
  problem: string;
  suggestion: string;
  /** True while the set is being published: nothing in it changes then. */
  locked: boolean;
  onSetPath: (path: string) => void;
}

/** A path that cannot be used yet: the reason, and a field prefilled with a cleaned path the person takes or changes. */
function PathFix({ row, problem, suggestion, locked, onSetPath }: PathFixProps) {
  const [typed, setTyped] = useState(suggestion);
  const problemId = useId();
  return (
    <form
      noValidate
      className="flex min-w-0 flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSetPath(typed.trim());
      }}
    >
      <p id={problemId} role="alert" className="text-xs break-words text-tone-danger">{problem}</p>
      <div className="flex min-w-0 items-center gap-2">
        <Input value={typed} onChange={(event) => { setTyped(event.target.value); }} aria-label={`Path for ${row.file.name}`} aria-describedby={problemId} autoCapitalize="off" autoCorrect="off" spellCheck={false} disabled={locked} className="h-7 flex-1 font-mono text-sm" />
        <Button type="submit" variant="outline" size="xs" disabled={locked}>Use path</Button>
      </div>
    </form>
  );
}

interface BatchRowProps {
  row: PageRow;
  problem: string | undefined;
  replaces: string | undefined;
  suggestion: string;
  /** True while the set is being published: a file cannot be left out of a publish on its way. */
  locked: boolean;
  onLeaveOut: () => void;
  onRetry: () => void;
  onSetPath: (path: string) => void;
}

/** One file on its way to the page: its name, the path it takes (or why that path cannot be used), what it replaces, and its upload. */
function BatchRow({ row, problem, replaces, suggestion, locked, onLeaveOut, onRetry, onSetPath }: BatchRowProps) {
  return (
    <li className="card-nested flex min-w-0 flex-col gap-1.5 bg-card px-3 py-2" data-slot="page-batch-row">
      <div className="flex min-w-0 items-center gap-2">
        <StageIcon row={row} problem={problem !== undefined} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono text-sm">{row.path}</span>
          {row.file.name === row.path ? null : <span className="truncate text-xs text-muted-foreground">{row.file.name}</span>}
        </span>
        {row.stage === "failed" ? (
          <Button type="button" variant="ghost" size="xs" onClick={onRetry}><IconRefresh aria-hidden /> Try again</Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Leave out ${row.path}`} title="Leave this file out" disabled={locked} onClick={onLeaveOut}>
          <IconX />
        </Button>
      </div>
      {replaces ? <p className="text-xs font-medium text-tone-warning" data-slot="page-batch-replaces">Replaces {replaces}</p> : null}
      {problem ? <PathFix key={row.path} row={row} problem={problem} suggestion={suggestion} locked={locked} onSetPath={onSetPath} /> : null}
      {row.stage === "sending" ? <Progress value={row.progress} aria-label={`Uploading ${row.path}`} /> : null}
      {problem ? null : <p role={row.stage === "failed" ? "alert" : undefined} className={cn("text-xs break-words", row.stage === "failed" ? "text-tone-danger" : "text-muted-foreground")}>{stageWords(row)}</p>}
    </li>
  );
}

/** The line at the top of the set: what is happening to it. */
function headline(batch: PageBatch): string {
  const count = batch.rows.length;
  const files = count === 1 ? "1 file" : `${String(count)} files`;
  if (batch.publishing) return `Adding ${files} to the page…`;
  if (batch.step === "fix") return `${files} to add. Fix the paths marked below.`;
  if (batch.step === "confirm") return `${files} ready. Some replace files the page has.`;
  if (batch.step === "too-many") return `${files} to add. They do not fit the page.`;
  if (batch.step === "failed") return `${files} to add. Try again or leave out the files marked below.`;
  const ready = batch.rows.filter((row) => row.stage === "ready").length;
  return `Uploading ${files} · ${String(ready)} ready`;
}

/** The paths of the set's other files, lowercase, for a row's suggestion. */
function takenBesides(rows: readonly PageRow[], key: string): Set<string> {
  return new Set(rows.filter((row) => row.key !== key).map((row) => row.path.toLowerCase()));
}

/**
 * A person's set of page files on its way in: one line for the set with
 * Cancel and, when it replaces files, the button that goes ahead; the
 * page's limits or a refused publish in the server's words, with Try
 * again; and a row per file.
 */
export function PageBatchList({ batch, held }: { batch: PageBatch; held: readonly HeldPageFile[] }) {
  if (batch.rows.length === 0) return null;
  const replacing = batch.review.replaces.size;
  return (
    <div data-slot="page-batch" className="card-nested flex min-w-0 flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm">{headline(batch)}</p>
        {batch.step === "confirm" ? (
          <Button type="button" size="xs" onClick={batch.confirm}>{publishButtonWords(batch.rows.length, replacing)}</Button>
        ) : null}
        <Button type="button" variant="ghost" size="xs" disabled={batch.publishing} onClick={batch.cancel}>Cancel</Button>
      </div>
      {batch.review.setProblem ? <p role="alert" className="text-xs break-words text-tone-danger">{batch.review.setProblem} Leave some files out to add the rest.</p> : null}
      {batch.publishError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="min-w-0 flex-1 text-xs break-words whitespace-pre-line text-tone-danger">{batch.publishError}</p>
          <Button type="button" variant="outline" size="xs" onClick={batch.publishAgain}><IconRefresh aria-hidden /> Try again</Button>
        </div>
      ) : null}
      <ul className="flex min-w-0 flex-col gap-2" aria-label="Files to add">
        {batch.rows.map((row) => (
          <BatchRow
            key={row.key}
            row={row}
            problem={batch.review.pathProblems.get(row.key)}
            replaces={batch.review.replaces.get(row.key)}
            suggestion={pathSuggestion(row.path, held, takenBesides(batch.rows, row.key))}
            locked={batch.publishing}
            onLeaveOut={() => { batch.leaveOut(row.key); }}
            onRetry={() => { batch.retry(row.key); }}
            onSetPath={(path) => { batch.setPath(row.key, path); }}
          />
        ))}
      </ul>
    </div>
  );
}
