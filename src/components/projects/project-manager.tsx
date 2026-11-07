"use client";

import { IconArrowLeft, IconLoader2, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { createProjectAction, deleteProjectAction, mergeProjectsAction } from "@/app/(workspace)/app/project-actions";
import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectSummary } from "@/lib/projects/queries";
import { projectNameKey } from "@/lib/projects/rules";
import { cn } from "@/lib/utils";

import { ProjectRow } from "./project-row";

interface ScopeTeam {
  id: string;
  slug: string;
  name: string;
}

interface ProjectManagerProps {
  initialProjects: ProjectSummary[];
  /** The viewer's shared teams, for the scope tabs. */
  teams: ScopeTeam[];
  /** The team whose projects these are, or null for the viewer's own. */
  team: ScopeTeam | null;
}

function byName(a: ProjectSummary, b: ProjectSummary) {
  return projectNameKey(a.name).localeCompare(projectNameKey(b.name));
}

/** Mine, then one tab per shared team, like the artifact list. */
function ScopeNav({ teams, team }: { teams: ScopeTeam[]; team: ScopeTeam | null }) {
  if (teams.length === 0) return null;
  const tabs = [{ key: "mine", label: "Mine", href: "/app/projects", active: team === null }, ...teams.map((item) => ({ key: item.id, label: item.name, href: `/app/projects?team=${encodeURIComponent(item.slug)}`, active: item.id === team?.id }))];
  return (
    <nav aria-label="Project scope" className="mb-4 flex flex-wrap gap-1">
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} aria-current={tab.active ? "page" : undefined} className={cn("rounded-sm px-2.5 py-1 text-sm transition-colors", tab.active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/** The form that adds a project. Errors show under the field, never as a browser bubble. */
function NewProjectForm({ team, onCreated }: { team: ScopeTeam | null; onCreated: (project: ProjectSummary) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the project a name.");
      return;
    }
    setPending(true);
    const result = await createProjectAction({ teamSlug: team?.slug ?? null }, { name, icon: null }).catch(() => null);
    setPending(false);
    if (!result?.success) {
      setError(result?.error ?? "The project was not created. Try again.");
      return;
    }
    setError(null);
    setName("");
    onCreated({ ...result.data, count: 0 });
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="border-b p-5">
      <Label htmlFor="project-name">New project</Label>
      <div className="mt-2 flex gap-2">
        <Input id="project-name" value={name} onChange={(event) => { setName(event.target.value); setError(null); }} maxLength={120} placeholder="Billing migration" aria-invalid={error ? true : undefined} aria-describedby={error ? "project-name-error" : undefined} className="h-9 min-w-0" />
        <Button type="submit" disabled={pending} size="lg" className="px-3">
          {pending ? <IconLoader2 className="animate-spin" /> : <IconPlus />} Create
        </Button>
      </div>
      {error ? <p id="project-name-error" role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

type Subject = { source: ProjectSummary; target: ProjectSummary | null } | null;

function deleteCopy(subject: Subject) {
  if (!subject) return "";
  const { name, count } = subject.source;
  return `“${name}” goes away. Its ${String(count)} ${count === 1 ? "artifact stays" : "artifacts stay"}, with no project.`;
}

function mergeCopy(subject: Subject) {
  if (!subject?.target) return "";
  return `Every artifact in “${subject.source.name}” moves to “${subject.target.name}”, and “${subject.source.name}” goes away.`;
}

/**
 * The Projects page: create, rename, change icons, merge, and delete. Merge
 * and delete ask first, with "Don't ask again"; neither deletes artifacts.
 */
export function ProjectManager({ initialProjects, teams, team }: ProjectManagerProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [subject, setSubject] = useState<Subject>(null);
  const confirmDelete = useConfirm("deleteProject");
  const confirmMerge = useConfirm("mergeProject");
  const listHref = team ? `/app?team=${encodeURIComponent(team.slug)}` : "/app";

  function replace(next: ProjectSummary) {
    setProjects((current) => current.map((item) => (item.id === next.id ? next : item)).sort(byName));
  }

  async function remove(source: ProjectSummary) {
    const result = await deleteProjectAction(source.id).catch(() => null);
    if (!result?.success) {
      toast.error(result?.error ?? "The project was not deleted. Try again.");
      return false;
    }
    setProjects((current) => current.filter((item) => item.id !== source.id));
    toast.success(`Deleted “${source.name}”. Its artifacts now have no project.`);
    return true;
  }

  async function merge(source: ProjectSummary, target: ProjectSummary) {
    const result = await mergeProjectsAction(source.id, target.id).catch(() => null);
    if (!result?.success) {
      toast.error(result?.error ?? "The projects were not merged. Try again.");
      return false;
    }
    setProjects((current) => current.filter((item) => item.id !== source.id).map((item) => (item.id === target.id ? { ...item, count: item.count + source.count } : item)));
    toast.success(`Moved everything from “${source.name}” into “${target.name}”.`);
    return true;
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-4 py-8 sm:p-6 sm:py-10">
      <Link href={listHref} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <IconArrowLeft aria-hidden className="size-3.5" /> Back to artifacts
      </Link>
      <ScopeNav teams={teams} team={team} />
      <div className="mb-6">
        <h1 className="text-xl font-medium tracking-[-0.01em]">{team ? `${team.name} projects` : "Your projects"}</h1>
        <p className="mt-1 max-w-xl text-md leading-6 text-muted-foreground">
          {team
            ? "Group what the team shares so people and agents find it fast. Everyone in the team can change these. Readers outside the team never see them."
            : "Group your private artifacts so you and your agents find them fast. Only you see these."}
        </p>
      </div>
      <section className="card-surface overflow-hidden">
        <NewProjectForm team={team} onCreated={(created) => { setProjects((current) => [...current, created].sort(byName)); }} />
        {projects.length === 0 ? (
          <p className="px-5 py-10 text-center text-md text-muted-foreground">No projects yet. Create one here, or let an agent set a project name when it saves.</p>
        ) : (
          <ul className="divide-y">
            {projects.map((item) => (
              <ProjectRow
                key={item.id}
                project={item}
                others={projects.filter((other) => other.id !== item.id)}
                listHref={listHref}
                onChanged={replace}
                onDelete={() => { setSubject({ source: item, target: null }); confirmDelete.request(() => remove(item)); }}
                onMerge={(target) => { setSubject({ source: item, target }); confirmMerge.request(() => merge(item, target)); }}
              />
            ))}
          </ul>
        )}
      </section>
      <ConfirmDialog state={confirmDelete.dialog} title="Delete this project?" description={deleteCopy(subject)} confirmLabel="Delete project" />
      <ConfirmDialog state={confirmMerge.dialog} title="Merge these projects?" description={mergeCopy(subject)} confirmLabel="Merge" />
    </main>
  );
}
