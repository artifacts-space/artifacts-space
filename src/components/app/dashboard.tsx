"use client";

import { IconLoader2, IconPlus, IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ArtifactEditor } from "@/components/app/artifact-editor/artifact-editor";
import { ArtifactList } from "@/components/app/artifact-list";
import { artifactListState, filterArtifactList } from "@/components/app/artifact-list-state";
import { CreateArtifactDialog } from "@/components/app/create-artifact-dialog";
import { ProjectFilter } from "@/components/app/project-filter";
import { TagFilter } from "@/components/app/tag-filter";
import { ScopeTabs } from "@/components/app/scope-tabs";
import { serverProjectsApi, type ProjectsApi } from "@/components/app/projects-api";
import { ShareTeamsProvider, type ShareTeam } from "@/components/app/share-teams-context";
import { SharedArtifactPanel } from "@/components/app/shared-artifact-panel";
import { useEditAccess, useWithdrawSharing } from "@/components/app/use-edit-access";
import { useFullArtifact } from "@/components/app/use-full-artifact";
import { useServerSearch } from "@/components/app/use-server-search";
import { useDashboardProjects } from "@/components/app/use-dashboard-projects";
import { PanelSizesBeforePaint, SidebarSplitter, sidebarPanelId } from "@/components/app/workspace-splitters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LinkedCommentsProvider } from "@/components/comments/linked-comments";
import { SidebarProjects } from "@/components/projects/sidebar-projects";
import { withoutArtifactLink, type ArtifactLink } from "@/lib/app-link";
import { kinds } from "@/lib/artifact-kinds";
import { toArtifactListItem } from "@/lib/artifact-preview";
import type { ArtifactDto, ArtifactListItemDto } from "@/lib/artifact-types";
import { listMinHeight, sidebarColumns } from "@/lib/panel-size-rules";
import type { ProjectFacets } from "@/lib/projects/queries";
import type { ProjectFilter as ProjectFilterValue } from "@/lib/projects/rules";
import { matchesProjectFilter, type SidebarProjectRow } from "@/lib/projects/sidebar-rules";
import type { TagFacet } from "@/lib/tags/queries";
import { cn } from "@/lib/utils";

interface DetailPaneProps {
  selected: ArtifactListItemDto | null;
  viewerId: string;
  origin: string;
  onUpdated: (artifact: ArtifactDto) => void;
  onDeleted: (id: string) => void;
  onCreate: () => void;
  initialFull: readonly ArtifactDto[] | undefined;
}

/** Shown while the selected artifact's content loads, or when it could not. */
function LoadingPane({ failure, onRetry }: { failure: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-md text-muted-foreground" role="status">
      {failure ? (
        <div className="max-w-sm text-center">
          <p>{failure}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>
        </div>
      ) : (
        <span className="flex items-center gap-2"><IconLoader2 className="size-4 animate-spin" /> Opening the artifact</span>
      )}
    </div>
  );
}

/** The full artifact with the list's project: the list holds the newest one, since the sidebar can move the open artifact. */
function withListProject(full: ArtifactDto | null, selected: ArtifactListItemDto | null): ArtifactDto | null {
  if (!full || selected?.id !== full.id) return full;
  return { ...full, project: selected.project };
}

/** The editor for an artifact the viewer may edit, a read-only view for a teammate's, or the empty state. */
function DetailPane({ selected, viewerId, origin, onUpdated, onDeleted, onCreate, initialFull }: DetailPaneProps) {
  const { full: loaded, failure, remember, retry } = useFullArtifact(selected, initialFull);
  const full = withListProject(loaded, selected);
  const access = useEditAccess(full, viewerId);
  const withdrawal = useWithdrawSharing(full?.id ?? "", onDeleted);
  const handleUpdated = (artifact: ArtifactDto) => {
    remember(artifact);
    onUpdated(artifact);
  };
  if (selected && !full) return <LoadingPane failure={failure} onRetry={retry} />;
  if (full && (access.isAuthor || access.canEdit)) {
    const onWithdraw = access.canWithdraw ? () => void withdrawal.withdraw() : null;
    return (
      <ArtifactEditor
        key={full.id}
        artifact={full}
        origin={origin}
        canShare={access.canShare}
        canDelete={access.canDelete}
        team={access.team}
        seesComments={access.seesComments}
        onWithdraw={onWithdraw}
        onUpdated={handleUpdated}
        onDeleted={onDeleted}
      />
    );
  }
  if (full) return <SharedArtifactPanel key={full.id} artifact={full} viewerId={viewerId} onUpdated={handleUpdated} onWithdrawn={onDeleted} />;
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <h2 className="text-lg font-medium">No artifacts yet</h2>
        <p className="mt-2 text-md leading-6 text-muted-foreground">
          Create one here, or connect an agent and let it create artifacts through MCP.
        </p>
        <Button onClick={onCreate} className="mt-5"><IconPlus /> New artifact</Button>
      </div>
    </div>
  );
}

/** Title, counts (every artifact in scope and the projects they use), and the create button. Team scopes list others' work, so they have no create button. */
function DashboardHeading({ facets, scopeTeam, onCreate }: { facets: ProjectFacets; scopeTeam: ShareTeam | null; onCreate: () => void }) {
  const total = facets.total;
  const projects = facets.projects.length;
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-medium tracking-[-0.01em]">{scopeTeam ? `Shared with ${scopeTeam.name}` : "Artifacts"}</h1>
        <p className="mt-1 text-md text-muted-foreground">
          {total} {total === 1 ? "artifact" : "artifacts"} across {projects} {projects === 1 ? "project" : "projects"}
        </p>
      </div>
      {scopeTeam ? null : (
        <Button onClick={onCreate} className="px-3">
          <IconPlus /> New artifact
        </Button>
      )}
    </div>
  );
}

/** The selected item, from the list or from server search results; else the first shown. */
function pickSelected(artifacts: ArtifactListItemDto[], filtered: ArtifactListItemDto[], selectedId: string) {
  return artifacts.find((artifact) => artifact.id === selectedId) ?? filtered.find((artifact) => artifact.id === selectedId) ?? filtered[0] ?? null;
}

interface DashboardProps {
  /** List items: previews, not content. The selected artifact loads in full. */
  initialArtifacts: ArtifactListItemDto[];
  origin: string;
  viewerId: string;
  teams: ShareTeam[];
  /** The team whose shared artifacts are shown, or null for the viewer's own. */
  scopeTeam: ShareTeam | null;
  /** The project filter's entries and counts for the whole scope. */
  facets: ProjectFacets;
  /** The projects the viewer may use in this list, for the sidebar's Projects group. */
  projectRows: SidebarProjectRow[];
  /** The project filter in the URL; the list is already filtered by it. */
  projectFilter: ProjectFilterValue | null;
  /** The tag filter's entries and counts for the whole scope. */
  tagFacets: TagFacet[];
  /** The tags in the URL; the list is already filtered by them. */
  tagFilter: string[];
  /** Full artifacts already in hand, so they open without a load (the /dev/workspace fixture). */
  initialFull?: readonly ArtifactDto[];
  /** Where project changes go: the server actions, or the fixture's stand-in. */
  projectsApi?: ProjectsApi;
  /** The list's path, for filter links: /app, or the fixture's page. */
  listPath?: string;
  /** The artifact the URL asked to open (`?artifact=<id>`), and whether to open its comments. */
  link?: ArtifactLink | null;
}

/** The artifact to select first: the linked one when it is in the list, else the first. */
function firstSelection(artifacts: ArtifactListItemDto[], link: ArtifactLink | null | undefined) {
  const linked = link ? artifacts.find((artifact) => artifact.publicId === link.publicId) : undefined;
  return linked?.id ?? artifacts[0]?.id ?? "";
}

/** Once the link has opened its artifact, drops it from the address bar so a reload or a later pick does not jump back. */
function useForgetArtifactLink(link: ArtifactLink | null | undefined) {
  useEffect(() => {
    if (!link) return;
    const { pathname, search, hash } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${withoutArtifactLink(search)}${hash}`);
  }, [link]);
}

/** The artifact whose comments the link asked to open, if any. */
function linkedCommentsId(link: ArtifactLink | null | undefined): string | null {
  return link?.comments ? link.publicId : null;
}

export function Dashboard({ initialArtifacts, origin, viewerId, teams, scopeTeam, facets, projectRows, projectFilter, tagFacets, tagFilter, initialFull, projectsApi = serverProjectsApi, listPath = "/app", link }: DashboardProps) {
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [selectedId, setSelectedId] = useState(() => firstSelection(initialArtifacts, link));
  useForgetArtifactLink(link);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sidebar = useDashboardProjects({ artifacts, setArtifacts, rows: projectRows, facets, api: projectsApi, teams, scopeTeam, tagFilter, listPath, viewerId });

  const serverMatches = useServerSearch(query, scopeTeam?.id ?? null, projectFilter, tagFilter);
  // A card moved out of the filtered project leaves the list at once; Undo brings it back.
  const inFilter = useMemo(() => artifacts.filter((item) => matchesProjectFilter(item.project, projectFilter)), [artifacts, projectFilter]);
  const filtered = useMemo(() => filterArtifactList(inFilter, { query, kind }, serverMatches), [inFilter, kind, query, serverMatches]);

  const selected = pickSelected(artifacts, filtered, selectedId);

  function created(artifact: ArtifactDto) {
    setArtifacts((current) => [toArtifactListItem(artifact), ...current]);
    setSelectedId(artifact.id);
    setQuery("");
    setKind("all");
  }

  function updated(artifact: ArtifactDto) {
    setArtifacts((current) => current.map((item) => (item.id === artifact.id ? toArtifactListItem(artifact) : item)));
  }

  function deleted(id: string) {
    setArtifacts((current) => {
      const next = current.filter((artifact) => artifact.id !== id);
      setSelectedId(next[0]?.id ?? "");
      return next;
    });
  }

  return (
    <ShareTeamsProvider teams={teams}>
      <LinkedCommentsProvider publicId={linkedCommentsId(link)}>
      {/* An app shell from md up: the frame is the viewport (workspace-frame), and only the list and the artifact scroll. */}
      <main data-app-shell className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-none flex-col p-4 sm:p-6 md:min-h-0 md:flex-1">
        <ScopeTabs teams={teams} activeSlug={scopeTeam?.slug ?? null} />
        <DashboardHeading facets={facets} scopeTeam={scopeTeam} onCreate={() => { setCreateOpen(true); }} />

        <PanelSizesBeforePaint />
        {/* overflow-clip, not hidden: it rounds the corners without becoming a scroll box, so the artifact's toolbar can stick on phones. */}
        <div ref={shellRef} className={cn("card-surface relative grid min-h-[640px] flex-1 overflow-clip md:min-h-0 md:grid-rows-[auto_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]", sidebarColumns)}>
          <aside ref={sidebarRef} id={sidebarPanelId} className="relative flex min-h-0 min-w-0 flex-col border-b bg-background/60 max-md:max-h-[360px] md:max-lg:max-h-[min(360px,32dvh)] lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-b-0">
            <div className="shrink-0 space-y-2 border-b p-3">
              <div className="relative">
                <IconSearch className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); }}
                  placeholder="Search"
                  aria-label="Search artifacts"
                  className="h-8 bg-card pl-8"
                />
              </div>
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-1">
                <Select value={kind} onValueChange={(value) => { setKind(value ?? "all"); }}>
                  <SelectTrigger size="sm" className="h-7 w-full min-w-0 border-0 bg-transparent px-1 text-sm text-muted-foreground shadow-none" aria-label="Filter by format">
                    <SelectValue>{(value: string) => (value === "all" ? "All formats" : value)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All formats</SelectItem>
                    {kinds.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
                <ProjectFilter facets={facets} filter={projectFilter} scopeTeam={scopeTeam} tags={tagFilter} listPath={listPath} />
              </div>
              <TagFilter facets={tagFacets} selected={tagFilter} projectFilter={projectFilter} scopeTeam={scopeTeam} listPath={listPath} />
            </div>
            <SidebarProjects
              controls={sidebar.projects}
              filter={projectFilter}
              onFilter={sidebar.filterBy}
              scopeTeam={scopeTeam}
              teams={sidebar.shared}
              dragging={sidebar.dragging}
              blockedKeys={sidebar.blockedKeys}
              onDropArtifact={sidebar.dropped}
              listRef={listRef}
            />
            <div ref={listRef} data-slot="artifact-list" className={cn("relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-2", listMinHeight)}>
              <ArtifactList
                state={artifactListState({ total: artifacts.length, shown: filtered.length })}
                artifacts={filtered}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                onClearFilters={() => { setQuery(""); setKind("all"); }}
                moves={sidebar.moves}
              />
            </div>
            <div className="shrink-0 border-t px-4 py-2.5 text-xs text-muted-foreground">
              {filtered.length} shown
            </div>
          </aside>
          <SidebarSplitter shell={shellRef} sidebar={sidebarRef} />

          <DetailPane
            selected={selected}
            viewerId={viewerId}
            origin={origin}
            onUpdated={updated}
            onDeleted={deleted}
            onCreate={() => { setCreateOpen(true); }}
            initialFull={initialFull}
          />
        </div>

        <CreateArtifactDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={created} />
      </main>
      </LinkedCommentsProvider>
    </ShareTeamsProvider>
  );
}
