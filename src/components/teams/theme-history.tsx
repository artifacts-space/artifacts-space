"use client";

import { IconHistory, IconLoader2, IconRestore } from "@tabler/icons-react";
import { useId, useState } from "react";

import { ThemeScope } from "@/components/artifact-view/theme-scope";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/artifact-types";
import { formatExactTime } from "@/lib/relative-time";
import type { Theme } from "@/lib/themes/schema";
import type { TeamThemeRevisionDto } from "@/lib/themes/team-theme-revisions";

import { FormError } from "./form-error";

/**
 * Restore history for team themes: a list of saved revisions, newest first,
 * each with who saved it, when, and a small swatch, and Restore on every
 * older one. Restoring saves a new revision; old ones never change. Only
 * owners and admins see it (the actions refuse everyone else).
 */

/** A tiny swatch: the theme's page, text, accent, and first chart colors. */
export function ThemeDots({ theme }: { theme: Theme | null }) {
  if (!theme) return <span aria-hidden className="card-nested inline-block h-5 w-12 shrink-0 rounded-md" />;
  return (
    <ThemeScope theme={theme} aria-hidden className="card-nested flex h-5 w-12 shrink-0 items-center gap-0.5 rounded-md bg-background px-1">
      <span className="size-2.5 rounded-full bg-foreground" />
      <span className="size-2.5 rounded-full bg-primary" />
      <span className="size-2.5 rounded-full bg-series-1" />
    </ThemeScope>
  );
}

function whoAndWhen(revision: TeamThemeRevisionDto): string {
  const when = formatExactTime(new Date(revision.createdAt));
  return revision.by ? `${revision.by}, ${when}` : when;
}

interface RestoreButtonProps {
  index: number;
  label: string;
  at: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}

/** Restore on one older revision: "Restore previous" for the one before the current, "Restore" for the rest. The accessible name starts with the visible text. */
function RestoreButton({ index, label, at, busy, disabled, onClick }: RestoreButtonProps) {
  const text = index === 1 ? "Restore previous" : "Restore";
  return (
    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onClick} aria-label={`${text}: ${label}, ${formatExactTime(new Date(at))}`}>
      {busy ? <IconLoader2 className="animate-spin" /> : <IconRestore />} {text}
    </Button>
  );
}

interface HistoryPanelProps {
  /** Loads the revisions (a server action). */
  load: () => Promise<ActionResult<TeamThemeRevisionDto[]>>;
  /** Restores one revision; resolves true when it saved, so the list reloads. */
  onRestore: (revision: TeamThemeRevisionDto) => Promise<boolean>;
  /** What one revision shows: its name, and the theme for its swatch. */
  describe: (revision: TeamThemeRevisionDto) => { label: string; theme: Theme | null };
  /** The button that opens the list. */
  title: string;
  disabled?: boolean;
}

/** A "History" toggle that loads the revisions when opened, each with Restore. */
export function HistoryPanel({ load, onRestore, describe, title, disabled = false }: HistoryPanelProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<TeamThemeRevisionDto[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    try {
      const result = await load();
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError("");
      setRevisions(result.data);
    } catch {
      setError("The history could not load. Check your connection and try again.");
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void refresh();
  }

  async function restore(revision: TeamThemeRevisionDto) {
    setBusy(revision.id);
    try {
      if (await onRestore(revision)) await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2" data-theme-history="">
      <Button type="button" size="sm" variant="ghost" aria-expanded={open} aria-controls={listId} onClick={toggle} disabled={disabled}>
        <IconHistory /> {title}
      </Button>
      <div id={listId}>
        {open ? (
          <div className="card-nested rounded-lg">
            <FormError message={error} />
            {revisions === null && !error ? <p className="px-3 py-2 text-sm text-muted-foreground">Loading the history…</p> : null}
            {revisions?.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">No saved changes yet. Every save from now on shows here.</p> : null}
            {revisions && revisions.length > 0 ? (
              <ol className="max-h-64 divide-y overflow-y-auto overscroll-contain" aria-label={title}>
                {revisions.map((revision, index) => {
                  const shown = describe(revision);
                  return (
                    <li key={revision.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-revision={revision.id}>
                      <ThemeDots theme={shown.theme} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{shown.label}{index === 0 ? <span className="ml-2 text-xs font-normal text-muted-foreground">Current</span> : null}</p>
                        <p className="truncate text-xs text-muted-foreground">{whoAndWhen(revision)}</p>
                      </div>
                      {index === 0 ? null : <RestoreButton index={index} label={shown.label} at={revision.createdAt} busy={busy === revision.id} disabled={disabled || busy !== null} onClick={() => void restore(revision)} />}
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
