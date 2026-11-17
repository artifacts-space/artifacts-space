"use client";

import { IconSettings } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { ProjectLabel } from "@/components/projects/project-label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { projectFilterId, workspaceQuery } from "@/lib/projects/filter-params";
import type { ProjectFacets } from "@/lib/projects/queries";
import type { ProjectFilter as Filter } from "@/lib/projects/rules";

interface ProjectFilterProps {
  facets: ProjectFacets;
  filter: Filter | null;
  /** The team whose list this is, or null for the viewer's own. */
  scopeTeam: { slug: string } | null;
  /** The list's path: /app, or the /dev/workspace fixture. */
  listPath?: string;
  /** The tag filter in the URL, kept when the project changes. */
  tags: string[];
}

function filterFromId(id: string): Filter | null {
  if (id === "none") return { none: true };
  return id.startsWith("key:") ? { key: id.slice(4) } : null;
}

/** The label of the chosen filter entry. */
function chosenLabel(id: string, facets: ProjectFacets) {
  if (id === "all") return "All projects";
  if (id === "none") return "No project";
  const facet = facets.projects.find((item) => `key:${item.key}` === id);
  return facet ? <ProjectLabel name={facet.name} icon={facet.icon} /> : "All projects";
}

/**
 * The project filter beside the format filter: all projects, no project, or
 * one project with its icon and count. It lives in the URL, so links keep it.
 */
export function ProjectFilter({ facets, filter, scopeTeam, tags, listPath = "/app" }: ProjectFilterProps) {
  const teamSlug = scopeTeam ? scopeTeam.slug : null;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = projectFilterId(filter);
  const manageHref = teamSlug ? `/app/projects?team=${encodeURIComponent(teamSlug)}` : "/app/projects";

  function choose(id: string | null) {
    const next = filterFromId(id ?? "all");
    startTransition(() => { router.push(`${listPath}${workspaceQuery(teamSlug, next, tags)}`); });
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Select value={current} onValueChange={choose}>
        <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm text-muted-foreground shadow-none" aria-label="Filter by project" aria-busy={pending}>
          <SelectValue>{(value: string) => chosenLabel(value, facets)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All projects <span className="ml-auto pl-3 text-xs text-muted-foreground">{facets.total}</span></SelectItem>
          <SelectItem value="none">No project <span className="ml-auto pl-3 text-xs text-muted-foreground">{facets.none}</span></SelectItem>
          {facets.projects.length > 0 ? <SelectSeparator /> : null}
          {facets.projects.map((facet) => (
            <SelectItem key={facet.key} value={`key:${facet.key}`}>
              <ProjectLabel name={facet.name} icon={facet.icon} className="max-w-52" />
              <span className="ml-auto pl-3 text-xs text-muted-foreground">{facet.count}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Link href={manageHref} aria-label="Manage projects" title="Manage projects" className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <IconSettings aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}
