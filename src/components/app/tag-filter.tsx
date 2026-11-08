"use client";

import { IconChevronDown, IconTag, IconX } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { workspaceQuery } from "@/lib/projects/filter-params";
import type { ProjectFilter } from "@/lib/projects/rules";
import type { TagFacet } from "@/lib/tags/queries";

interface TagFilterProps {
  facets: TagFacet[];
  /** The tags in the URL: the list shows artifacts that carry every one. */
  selected: string[];
  projectFilter: ProjectFilter | null;
  /** The team whose list this is, or null for the viewer's own. */
  scopeTeam: { slug: string } | null;
}

/** The tags after turning one on or off in the filter. */
function toggled(selected: readonly string[], tag: string): string[] {
  return selected.includes(tag) ? selected.filter((item) => item !== tag) : [...selected, tag];
}

/**
 * The tag filter under the format and project filters: pick tags, and the
 * list shows artifacts that carry every one of them. It lives in the URL, so
 * links keep it. Hidden when the list has no tags at all.
 */
export function TagFilter({ facets, selected, projectFilter, scopeTeam }: TagFilterProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (facets.length === 0 && selected.length === 0) return null;
  const teamSlug = scopeTeam ? scopeTeam.slug : null;

  function go(tags: string[]) {
    startTransition(() => { router.push(`/app${workspaceQuery(teamSlug, projectFilter, tags)}`); });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1" aria-busy={pending}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<button type="button" />}
          className="inline-flex h-7 items-center gap-1 rounded-lg px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label="Filter by tag"
        >
          <IconTag aria-hidden className="size-3.5" />
          {selected.length === 0 ? "All tags" : "Tags"}
          <IconChevronDown aria-hidden className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 min-w-52">
          {facets.map((facet) => (
            <DropdownMenuCheckboxItem key={facet.tag} checked={selected.includes(facet.tag)} onCheckedChange={() => { go(toggled(selected, facet.tag)); }}>
              <span className="truncate">{facet.tag}</span>
              <span className="ml-auto pl-3 text-xs text-muted-foreground">{facet.count}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {selected.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => { go(toggled(selected, tag)); }}
          aria-label={`Stop filtering by ${tag}`}
          className="inline-flex h-6 max-w-40 items-center gap-0.5 rounded-md bg-muted px-1.5 text-xs text-foreground hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="truncate">{tag}</span>
          <IconX aria-hidden className="size-3 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}
