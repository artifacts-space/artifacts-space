"use client";

import { IconCheck, IconChevronDown, IconFolderPlus, IconLoader2, IconPlus, IconSettings, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { listArtifactProjectsAction, setArtifactProjectAction } from "@/app/(workspace)/app/project-actions";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import type { ArtifactProjectDto } from "@/lib/artifact-types";
import type { ArtifactProjectChoices } from "@/lib/projects/manage";
import type { ProjectChoice } from "@/lib/projects/store";
import { cn } from "@/lib/utils";

import { pickerOptions } from "./picker-options";
import { ProjectIcon, ProjectLabel } from "./project-label";

interface ProjectPickerProps {
  /** The artifact's internal id. */
  artifactId: string;
  value: ArtifactProjectDto | null;
  /** Called with the artifact's project after a change saved. */
  onChange: (project: ArtifactProjectDto | null) => void;
}

/** One row in the list: no project, an existing project, or a new one to create. */
type PickerRow = { kind: "none" } | { kind: "project"; project: ArtifactProjectDto & { count: number } } | { kind: "create"; name: string };

function rowsFor(choices: ArtifactProjectChoices | null, typed: string, hasValue: boolean): PickerRow[] {
  const { matches, create } = pickerOptions(choices?.projects ?? [], typed);
  const rows: PickerRow[] = hasValue && typed.trim() === "" ? [{ kind: "none" }] : [];
  rows.push(...matches.map((project) => ({ kind: "project" as const, project })));
  if (create) rows.push({ kind: "create", name: create });
  return rows;
}

function choiceFor(row: PickerRow): ProjectChoice {
  if (row.kind === "none") return { none: true };
  if (row.kind === "create") return { name: row.name };
  return { projectId: row.project.id };
}

function RowContent({ row, selectedId }: { row: PickerRow; selectedId: string | null }) {
  if (row.kind === "none") return <><IconX aria-hidden className="size-3.5 text-muted-foreground" /> No project</>;
  if (row.kind === "create") return <><IconPlus aria-hidden className="size-3.5 text-muted-foreground" /> Create “{row.name}”</>;
  return (
    <>
      <ProjectIcon icon={row.project.icon} />
      <span className="min-w-0 flex-1 truncate">{row.project.name}</span>
      {row.project.id === selectedId ? <IconCheck aria-label="Current project" className="size-3.5" /> : <span className="text-xs text-muted-foreground">{row.project.count}</span>}
    </>
  );
}

/** Where the artifact's projects are managed: the person's own, or the team's. */
function manageHref(choices: ArtifactProjectChoices | null) {
  return choices?.teamSlug ? `/app/projects?team=${encodeURIComponent(choices.teamSlug)}` : "/app/projects";
}

/** Loads the artifact's project choices when the picker opens. */
function useChoices(artifactId: string) {
  const [choices, setChoices] = useState<ArtifactProjectChoices | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const load = () => {
    setFailure(null);
    listArtifactProjectsAction(artifactId)
      .then((result) => {
        if (result.success) setChoices(result.data);
        else setFailure(result.error);
      })
      .catch(() => { setFailure("Projects did not load. Try again."); });
  };
  return { choices, failure, load };
}

/**
 * Picks the artifact's project: search, pick, create one by typing a new
 * name, or clear it. Saves at once, without a version or approval. For the
 * artifact's author and team only.
 */
export function ProjectPicker({ artifactId, value, onChange }: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [pending, startTransition] = useTransition();
  const { choices, failure, load } = useChoices(artifactId);
  const rows = rowsFor(choices, typed, value !== null);

  function openChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setTyped("");
    setHighlight(0);
    load();
  }

  function pick(row: PickerRow) {
    setOpen(false);
    startTransition(async () => {
      const result = await setArtifactProjectAction(artifactId, choiceFor(row)).catch(() => null);
      if (!result?.success) {
        toast.error(result?.error ?? "The project did not change. Try again.");
        return;
      }
      onChange(result.data);
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => (rows.length === 0 ? 0 : (current + step + rows.length) % rows.length));
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const row = rows[Math.min(highlight, rows.length - 1)];
    if (row) pick(row);
  }

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={value ? `Project: ${value.name}. Change project` : "Add to a project"}
            className="-ml-1.5 inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg px-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[popup-open]:bg-muted"
          />
        }
      >
        {pending ? <IconLoader2 aria-hidden className="size-3.5 animate-spin" /> : null}
        {value ? <ProjectLabel name={value.name} icon={value.icon} className="text-foreground" /> : <><IconFolderPlus aria-hidden className="size-3.5" /> Add to a project</>}
        <IconChevronDown aria-hidden className="size-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-72 p-0">
        <PopoverTitle className="sr-only">Choose a project</PopoverTitle>
        <div className="border-b p-2">
          <input
            autoFocus
            value={typed}
            onChange={(event) => { setTyped(event.target.value); setHighlight(0); }}
            onKeyDown={onKeyDown}
            aria-label="Find or create a project"
            placeholder="Find or create a project"
            maxLength={240}
            className="h-8 w-full rounded-md bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
        </div>
        <PickerList rows={rows} highlight={highlight} selectedId={value?.id ?? null} loading={!choices && !failure} failure={failure} onPick={pick} onHover={setHighlight} />
        <div className="border-t p-1">
          <Link href={manageHref(choices)} className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <IconSettings aria-hidden className="size-3.5" /> Manage projects
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface PickerListProps {
  rows: PickerRow[];
  highlight: number;
  selectedId: string | null;
  loading: boolean;
  failure: string | null;
  onPick: (row: PickerRow) => void;
  onHover: (index: number) => void;
}

function PickerList({ rows, highlight, selectedId, loading, failure, onPick, onHover }: PickerListProps) {
  if (failure) return <p className="px-3 py-4 text-sm text-muted-foreground" role="alert">{failure}</p>;
  if (loading) return <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground" role="status"><IconLoader2 aria-hidden className="size-3.5 animate-spin" /> Loading projects</p>;
  if (rows.length === 0) return <p className="px-3 py-4 text-sm text-muted-foreground">Type a name to create your first project.</p>;
  return (
    <ul className="max-h-64 overflow-y-auto overscroll-contain p-1" aria-label="Projects">
      {rows.map((row, index) => (
        <li key={row.kind === "project" ? row.project.id : row.kind}>
          <button
            type="button"
            onClick={() => { onPick(row); }}
            onMouseEnter={() => { onHover(index); }}
            className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm", index === highlight ? "bg-muted text-foreground" : "text-foreground/90")}
          >
            <RowContent row={row} selectedId={selectedId} />
          </button>
        </li>
      ))}
    </ul>
  );
}
