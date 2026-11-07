"use client";

import { IconArrowMerge, IconCheck, IconLoader2, IconPencil, IconTrash, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { renameProjectAction, setProjectIconAction } from "@/app/(workspace)/app/project-actions";
import { IconPicker } from "@/components/artifact-icon/icon-picker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { ProjectSummary } from "@/lib/projects/queries";
import { projectNameKey } from "@/lib/projects/rules";

import { ProjectIcon, ProjectLabel } from "./project-label";

interface ProjectRowProps {
  project: ProjectSummary;
  /** The other projects in the scope: merge targets. */
  others: ProjectSummary[];
  /** The artifact list for this scope, to link the count to the filtered list. */
  listHref: string;
  onChanged: (project: ProjectSummary) => void;
  onDelete: () => void;
  onMerge: (target: ProjectSummary) => void;
}

/** The icon button that opens the picker: Emoji and Icons only, since projects cannot use uploads. */
function ProjectIconButton({ project, onChanged }: { project: ProjectSummary; onChanged: (project: ProjectSummary) => void }) {
  const [pending, setPending] = useState(false);
  async function change(icon: string | null) {
    setPending(true);
    const result = await setProjectIconAction(project.id, icon).catch(() => null);
    setPending(false);
    if (!result?.success) {
      toast.error(result?.error ?? "The icon did not change. Try again.");
      return;
    }
    onChanged({ ...project, icon: result.data.icon });
  }
  const trigger = (
    <button type="button" aria-label={`Change the icon of ${project.name}`} title="Change icon" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {pending ? <IconLoader2 aria-hidden className="size-4 animate-spin" /> : <ProjectIcon icon={project.icon} className="size-4 text-md" />}
    </button>
  );
  return <IconPicker value={project.icon} onChange={(icon) => void change(icon)} trigger={trigger} allowUpload={false} />;
}

/** The inline rename form. Errors show under the field. */
function RenameForm({ project, onDone }: { project: ProjectSummary; onDone: (project: ProjectSummary | null) => void }) {
  const [name, setName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the project a name.");
      return;
    }
    setPending(true);
    const result = await renameProjectAction(project.id, name).catch(() => null);
    setPending(false);
    if (!result?.success) {
      setError(result?.error ?? "The project was not renamed. Try again.");
      return;
    }
    onDone({ ...project, name: result.data.name });
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="min-w-0 flex-1">
      <div className="flex items-center gap-1">
        <input
          value={name}
          onChange={(event) => { setName(event.target.value); setError(null); }}
          onKeyDown={(event) => { if (event.key === "Escape") onDone(null); }}
          aria-label="Project name"
          aria-invalid={error ? true : undefined}
          maxLength={120}
          className="h-8 min-w-0 flex-1 rounded-lg border bg-card px-2 text-base shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
        <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save name" disabled={pending}>
          {pending ? <IconLoader2 className="animate-spin" /> : <IconCheck />}
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => { onDone(null); }}>
          <IconX />
        </Button>
      </div>
      {error ? <p role="alert" className="mt-1 text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

/** Merge into another project: picking one asks for confirmation first. */
function MergeSelect({ project, others, onMerge }: { project: ProjectSummary; others: ProjectSummary[]; onMerge: (target: ProjectSummary) => void }) {
  if (others.length === 0) return null;
  return (
    <Select value={null} onValueChange={(id: string | null) => { const target = others.find((item) => item.id === id); if (target) onMerge(target); }}>
      <SelectTrigger size="sm" aria-label={`Merge ${project.name} into another project`} title="Merge into another project" className="h-7 border-0 bg-transparent px-1.5 text-muted-foreground shadow-none [&>svg:last-child]:hidden">
        <IconArrowMerge aria-hidden className="size-3.5" />
      </SelectTrigger>
      <SelectContent>
        {others.map((item) => (
          <SelectItem key={item.id} value={item.id}><ProjectLabel name={item.name} icon={item.icon} className="max-w-56" /></SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** One project: icon, name, how many artifacts it holds, and rename, merge, and delete. */
export function ProjectRow({ project, others, listHref, onChanged, onDelete, onMerge }: ProjectRowProps) {
  const [renaming, setRenaming] = useState(false);
  const join = listHref.includes("?") ? "&" : "?";
  const filtered = `${listHref}${join}project=${encodeURIComponent(projectNameKey(project.name))}`;
  return (
    <li className="flex items-center gap-2 px-3 py-2 sm:px-4">
      <ProjectIconButton project={project} onChanged={onChanged} />
      {renaming ? (
        <RenameForm project={project} onDone={(next) => { setRenaming(false); if (next) onChanged(next); }} />
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-md">{project.name}</span>
          <Link href={filtered} className="shrink-0 text-sm text-muted-foreground hover:text-foreground hover:underline">
            {project.count} {project.count === 1 ? "artifact" : "artifacts"}
          </Link>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Rename ${project.name}`} title="Rename" onClick={() => { setRenaming(true); }}>
            <IconPencil />
          </Button>
          <MergeSelect project={project} others={others} onMerge={onMerge} />
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${project.name}`} title="Delete" onClick={onDelete}>
            <IconTrash />
          </Button>
        </>
      )}
    </li>
  );
}
