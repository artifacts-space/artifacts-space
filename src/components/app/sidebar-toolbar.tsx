"use client";

import { IconFilter, IconPlus, IconSearch } from "@tabler/icons-react";
import { useEffect, useRef } from "react";

import { ProjectFilter } from "@/components/app/project-filter";
import { TagFilter } from "@/components/app/tag-filter";
import type { ShareTeam } from "@/components/app/share-teams-context";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { kinds } from "@/lib/artifact-kinds";
import type { ProjectFacets } from "@/lib/projects/queries";
import type { ProjectFilter as ProjectFilterValue } from "@/lib/projects/rules";
import { focusesSearch } from "@/lib/projects/sidebar-view-rules";
import type { TagFacet } from "@/lib/tags/queries";
import { cn } from "@/lib/utils";

/** True while focus is somewhere a "/" is typed: a field, a text area, a select, or editable content. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** True when the field is drawn and can take focus: not while the sidebar is hidden. */
function isShown(field: HTMLInputElement | null): field is HTMLInputElement {
  return field !== null && field.getClientRects().length > 0;
}

/** "/" anywhere outside a field puts the cursor in the search, while the search is on screen; otherwise the key is left alone. */
function useSearchShortcut(field: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const input = field.current;
      if (event.defaultPrevented || !isShown(input)) return;
      if (!focusesSearch({ key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey, altKey: event.altKey, typing: isTyping(event.target) })) return;
      event.preventDefault();
      input.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); };
  }, [field]);
}

/** The filters behind the filter button: format, project, and tags. Project and tags live in the URL. */
export interface SidebarFilters {
  kind: string;
  onKind: (kind: string) => void;
  facets: ProjectFacets;
  projectFilter: ProjectFilterValue | null;
  tagFacets: TagFacet[];
  tagFilter: string[];
  scopeTeam: ShareTeam | null;
  listPath: string;
}

/** How many filters are on, for the dot on the filter button. */
function activeFilters({ kind, projectFilter, tagFilter }: SidebarFilters): number {
  return (kind === "all" ? 0 : 1) + (projectFilter ? 1 : 0) + tagFilter.length;
}

function FilterPopover({ filters }: { filters: SidebarFilters }) {
  const active = activeFilters(filters);
  const label = active > 0 ? `Filters, ${String(active)} on` : "Filters";
  return (
    <Popover>
      <PopoverTrigger
        render={<button type="button" />}
        aria-label={label}
        title="Filters"
        className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[popup-open]:bg-muted"
      >
        <IconFilter aria-hidden className="size-4" />
        {active > 0 ? <span aria-hidden className="absolute -top-1 -right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-xs leading-4 text-background">{active}</span> : null}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-72 space-y-2 p-3">
        <PopoverTitle className="text-sm font-medium">Filters</PopoverTitle>
        <Select value={filters.kind} onValueChange={(value) => { filters.onKind(value ?? "all"); }}>
          <SelectTrigger size="sm" className="h-8 w-full min-w-0 text-sm" aria-label="Filter by format">
            <SelectValue>{(value: string) => (value === "all" ? "All formats" : value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All formats</SelectItem>
            {kinds.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
          </SelectContent>
        </Select>
        <ProjectFilter facets={filters.facets} filter={filters.projectFilter} scopeTeam={filters.scopeTeam} tags={filters.tagFilter} listPath={filters.listPath} />
        <TagFilter facets={filters.tagFacets} selected={filters.tagFilter} projectFilter={filters.projectFilter} scopeTeam={filters.scopeTeam} listPath={filters.listPath} />
      </PopoverContent>
    </Popover>
  );
}

interface SidebarToolbarProps {
  query: string;
  onQuery: (query: string) => void;
  filters: SidebarFilters;
  /** Starts a new artifact; null on a team workspace, which lists others' work. */
  onCreate: (() => void) | null;
}

/**
 * Search (with "/" to reach it), the filter button, and New artifact, in
 * one row under the workspace switcher.
 */
export function SidebarToolbar({ query, onQuery, filters, onCreate }: SidebarToolbarProps) {
  const field = useRef<HTMLInputElement>(null);
  useSearchShortcut(field);
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative min-w-0 flex-1">
        <IconSearch aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={field}
          value={query}
          onChange={(event) => { onQuery(event.target.value); }}
          onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); onQuery(""); } }}
          placeholder="Search"
          aria-label="Search artifacts"
          aria-keyshortcuts="/"
          className="h-9 bg-card pr-8 pl-8"
        />
        <kbd aria-hidden className={cn("pointer-events-none absolute top-1/2 right-2 inline-flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-md border px-1 font-mono text-xs text-muted-foreground", query && "hidden")}>/</kbd>
      </div>
      <FilterPopover filters={filters} />
      {onCreate ? (
        <button
          type="button"
          onClick={onCreate}
          aria-label="New artifact"
          title="New artifact"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs transition-colors hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <IconPlus aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
