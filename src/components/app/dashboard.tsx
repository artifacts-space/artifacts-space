"use client";

import { IconInfoCircle, IconLoader2, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";

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
import { useArtifactLink } from "@/components/app/use-artifact-link";
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
import type { LinkNotice } from "@/lib/app-link-rules";
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

/**
 * The slim bar right under the app header: scope tabs on the left, the create
 * button on the right, so the workspace below gets the height. The page's h1
 * stays for screen readers only. Team scopes list others' work, so they have
 * no create button. On phones the button shows only its icon and keeps its name.
 */
function WorkspaceBar({ teams, scopeTeam, onCreate }: { teams: readonly ShareTeam[]; scopeTeam: ShareTeam | null; onCreate: () => void }) {
  return (
    <>
      <h1 className="sr-only">{scopeTeam ? `Shared with ${scopeTeam.name}` : "Artifacts"}</h1>
      <div data-slot="workspace-bar" className="flex min-h-11 shrink-0 items-center gap-3 py-2">
        <ScopeTabs teams={teams} activeSlug={scopeTeam?.slug ?? null} />
        {scopeTeam ? null : (
          <Button size="sm" onClick={onCreate} title="New artifact" className="ml-auto shrink-0 max-sm:size-7 max-sm:px-0">
            <IconPlus /><span className="max-sm:sr-only">New artifact</span>
          </Button>
        )}
      </div>
    </>
  );
}

const linkNoticeText: Record<LinkNotice, string> = {
  gone: "This artifact is no longer available.",
  failed: "This artifact could not be opened just now. Try the link again in a moment.",
};

/** Shown when a link (from a notification, say) points to an artifact that is gone or no longer shared with the viewer, or could not be checked. */
function LinkNoticeBar({ notice, onDismiss }: { notice: LinkNotice; onDismiss: () => void }) {
  return (
    <div role="status" className="mb-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
      <IconInfoCircle aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">{linkNoticeText[notice]}</p>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}><IconX /></Button>
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
  /** Full artifacts already in hand, so they open without a load: one a link opened from outside the list, which the server loaded for the URL, or the /dev/workspace fixture's seed. */
  initialFull?: readonly ArtifactDto[];
  /** Where project changes go: the server actions, or the fixture's stand-in. */
  projectsApi?: ProjectsApi;
  /** The list's path, for filter links: /app, or the fixture's page. */
  listPath?: string;
  /** What the server found for the URL's link (`?artifact=<id>`), in the list or not, or null when it is missing or not the viewer's to read. */
  linkTarget?: ArtifactListItemDto | null;
  /** The server could not check the link just now (a read limit, or a database error). */
  linkFailed?: boolean;
}

export function Dashboard({ initialArtifacts, origin, viewerId, teams, scopeTeam, facets, projectRows, projectFilter, tagFacets, tagFilter, initialFull, projectsApi = serverProjectsApi, listPath = "/app", linkTarget, linkFailed }: DashboardProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const { artifacts, setArtifacts, selectedId, setSelectedId, notice, dismissNotice, opened } = useArtifactLink({ initialArtifacts, target: linkTarget, failed: linkFailed, list: listRef, detail: detailRef });
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
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
      <LinkedCommentsProvider link={opened} selectedPublicId={selected?.publicId ?? null}>
      {/* An app shell from md up: the frame is the viewport (workspace-frame), and only the list and the artifact scroll. */}
      <main data-app-shell className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-none flex-col px-4 pb-4 sm:px-6 sm:pb-6 md:min-h-0 md:flex-1">
        <WorkspaceBar teams={teams} scopeTeam={scopeTeam} onCreate={() => { setCreateOpen(true); }} />
        {notice ? <LinkNoticeBar notice={notice} onDismiss={dismissNotice} /> : null}

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

          {/* `contents` keeps the pane a grid item; the ref lets a link bring it into view on phones. */}
          <div ref={detailRef} data-slot="workspace-detail" className="contents">
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
        </div>

        <CreateArtifactDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={created} />
      </main>
      </LinkedCommentsProvider>
    </ShareTeamsProvider>
  );
}
