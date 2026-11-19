"use client";

import { IconInfoCircle, IconLoader2, IconPlus, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { ArtifactEditor } from "@/components/app/artifact-editor/artifact-editor";
import type { SaveArtifact } from "@/components/app/artifact-editor/use-autosave";
import { useQuietRefresh } from "@/components/app/artifact-editor/use-quiet-refresh";
import { artifactListState } from "@/components/app/artifact-list-state";
import { useHomeMoves, WorkspaceHomeProvider } from "@/components/app/home-moves";
import type { AttachFilesApi } from "@/components/files/attached-files";
import { serverProjectsApi, type ProjectsApi } from "@/components/app/projects-api";
import { ShareTeamsProvider, type ShareTeam } from "@/components/app/share-teams-context";
import { SharedArtifactPanel } from "@/components/app/shared-artifact-panel";
import { TeamWelcome, type DismissWelcome } from "@/components/app/team-welcome";
import { useEditAccess, useWithdrawSharing } from "@/components/app/use-edit-access";
import { useArtifactLink } from "@/components/app/use-artifact-link";
import { useSelectionInUrl } from "@/components/app/use-selection-url";
import { useFullArtifact, type ArtifactLoader } from "@/components/app/use-full-artifact";
import { useListFilters, useWorkspaceList } from "@/components/app/use-workspace-list";
import { useDashboardProjects } from "@/components/app/use-dashboard-projects";
import { serverNewArtifactApi, type NewArtifactApi } from "@/components/app/new-artifact/new-artifact-api";
import { NewArtifactPane } from "@/components/app/new-artifact/new-artifact-pane";
import { filteredProjectName, useNewArtifact, type NewArtifactSession } from "@/components/app/new-artifact/use-new-artifact";
import { PanelSizesBeforePaint, SidebarSplitter } from "@/components/app/workspace-splitters";
import { SidebarVisibilityProvider, useSidebarToggle } from "@/components/app/sidebar-visibility";
import { WorkspaceSidebar } from "@/components/app/workspace-sidebar";
import { Button } from "@/components/ui/button";
import { LinkedCommentsProvider } from "@/components/comments/linked-comments";
import type { LinkNotice } from "@/lib/app-link-rules";
import { toArtifactListItem } from "@/lib/artifact-preview";
import type { ArtifactDto, ArtifactListItemDto } from "@/lib/artifact-types";
import { sidebarColumns } from "@/lib/panel-size-rules";
import type { ProjectFacets } from "@/lib/projects/queries";
import { listAfterSave, listWithReturned } from "@/lib/sharing/home-move-rules";
import type { ProjectFilter as ProjectFilterValue } from "@/lib/projects/rules";
import type { SidebarProjectRow } from "@/lib/projects/sidebar-rules";
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
  loadArtifact: ArtifactLoader | undefined;
  /** How the artifact saves: the server action, or the fixture's store for artifacts New artifact made there. */
  save: SaveArtifact | undefined;
  /** Where the artifact's list of attached files uploads and attaches: the server actions, or the fixture's store. */
  attachApi: AttachFilesApi | undefined;
  /** This tab's own saves of the artifacts blank pages became, which may land after the pane took one over. */
  ownSaves: readonly ArtifactDto[];
  /** Artifacts an undone move brought back to this workspace, as the server answered them (useHomeMoves). */
  returned: ReadonlyMap<string, ArtifactDto>;
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

/** The copy Undo brought back when there is one: the pane's own copy is from before, when the artifact was in the other workspace. */
function newestCopy(loaded: ArtifactDto | null, selected: ArtifactListItemDto | null, returned: ReadonlyMap<string, ArtifactDto>): ArtifactDto | null {
  return (selected ? returned.get(selected.id) : undefined) ?? loaded;
}

/** The editor for an artifact the viewer may edit, a read-only view for a teammate's, or the empty state. */
function DetailPane({ selected, viewerId, origin, onUpdated, onDeleted, onCreate, initialFull, loadArtifact, save, attachApi, ownSaves, returned }: DetailPaneProps) {
  const { full: loaded, failure, remember, retry } = useFullArtifact(selected, initialFull, loadArtifact, ownSaves);
  const full = withListProject(newestCopy(loaded, selected, returned), selected);
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
        save={save}
        attachApi={attachApi}
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

/** The page's heading, for screen readers: the workspace switcher shows sighted people where they are. Focusable from code, so closing the welcome card can land there. */
function WorkspaceHeading({ scopeTeam, ref }: { scopeTeam: ShareTeam | null; ref: React.Ref<HTMLHeadingElement> }) {
  return <h1 ref={ref} tabIndex={-1} className="sr-only">{scopeTeam ? `Shared with ${scopeTeam.name}` : "Artifacts"}</h1>;
}

const linkNoticeText: Record<LinkNotice, string> = {
  gone: "This artifact is no longer available.",
  failed: "This artifact could not be opened just now. Try the link again in a moment.",
};

/** Shown when a link (from a notification, say) points to an artifact that is gone or no longer shared with the viewer, or could not be checked. */
function LinkNoticeBar({ notice, onDismiss }: { notice: LinkNotice | null; onDismiss: () => void }) {
  if (!notice) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-sm text-muted-foreground">
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
  /** How an artifact's content loads when it is opened: the server action, or the fixture's stand-in. */
  loadArtifact?: ArtifactLoader | undefined;
  /** Called each time a link in the address bar is acted on (the fixture counts them for its tests). */
  onLinkHandled?: () => void;
  /** Where New artifact stores the blank page: the server actions, or the fixture's stand-in. */
  newArtifactApi?: NewArtifactApi;
  /** The server decided this member sees the team's welcome card (src/lib/teams/welcome-rules.ts). Team workspaces only. */
  welcome?: boolean;
  /** The page has a server copy to catch up after saves (useQuietRefresh): true on /app; the fixture has none. */
  refreshAfterSaves?: boolean;
  /** Where "Got it" saves the closed welcome: the server action, or the fixture's stand-in. */
  dismissWelcome?: DismissWelcome;
}

interface WorkspacePaneProps extends Omit<DetailPaneProps, "onCreate" | "save" | "attachApi" | "ownSaves"> {
  fresh: ReturnType<typeof useNewArtifact>;
  api: NewArtifactApi;
  /** The project the list is filtered to, for a new artifact. */
  project: string | null;
  /** A blank page's artifact was saved: the server's copy of the workspace may catch up once the saves go quiet. */
  afterSave: () => void;
}

/** The artifact pane: the blank page while New artifact has one open, else the selected artifact. */
function WorkspacePane({ fresh, api, project, selected, viewerId, origin, onUpdated, onDeleted, initialFull, loadArtifact, returned, afterSave }: WorkspacePaneProps) {
  // Memoized so the stored copies are merged into the seed only when they or the seed change, not on every render.
  const { withStored, saved } = fresh;
  const full = useMemo(() => withStored(initialFull), [withStored, initialFull]);
  const newSaved = useCallback((key: number, artifact: ArtifactDto) => {
    saved(key, artifact);
    afterSave();
  }, [saved, afterSave]);
  if (fresh.session) {
    return (
      <NewArtifactPane
        key={fresh.session.key}
        viewerId={viewerId}
        origin={origin}
        api={api}
        project={project}
        sessionKey={fresh.session.key}
        focusRequest={fresh.session.focusRequest}
        onSaved={newSaved}
        onDeleted={onDeleted}
      />
    );
  }
  return <DetailPane selected={selected} viewerId={viewerId} origin={origin} onUpdated={onUpdated} onDeleted={onDeleted} onCreate={fresh.start} initialFull={full} loadArtifact={loadArtifact} save={api.update} attachApi={api} ownSaves={fresh.stored} returned={returned} />;
}

/** The card marked as open: the blank page's artifact once stored (none before), else the selected one. */
function listSelection(session: NewArtifactSession | null, selected: ArtifactListItemDto | null): string | null {
  if (session) return session.createdId;
  return selected?.id ?? null;
}

/** The shell's columns from lg up: the sidebar and the pane, or the pane alone while the sidebar is hidden. */
function shellColumns(sidebarHidden: boolean): string {
  return sidebarHidden ? "lg:grid-cols-[minmax(0,1fr)]" : sidebarColumns;
}

/** New artifact, on the viewer's own workspace only: team workspaces list others' work. */
function createIn(scopeTeam: ShareTeam | null, start: () => void): (() => void) | null {
  return scopeTeam ? null : start;
}

/** The full artifacts in hand: the page's own, plus any the address bar's changes loaded; the same array when there are none. */
function withHeld(initial: readonly ArtifactDto[] | undefined, held: readonly ArtifactDto[]): readonly ArtifactDto[] | undefined {
  return held.length === 0 ? initial : [...(initial ?? []), ...held];
}

/** A link that opens an artifact (a notification, a pasted URL) closes the blank page, so the pane shows what was asked for. */
function useLinkLeavesNewArtifact(opened: unknown, leave: () => void) {
  useEffect(() => { if (opened) leave(); }, [opened, leave]);
}

export function Dashboard({ initialArtifacts, origin, viewerId, teams, scopeTeam, facets, projectRows, projectFilter, tagFacets, tagFilter, initialFull, projectsApi = serverProjectsApi, listPath = "/app", linkTarget, linkFailed, loadArtifact, onLinkHandled, newArtifactApi = serverNewArtifactApi, welcome, refreshAfterSaves = false, dismissWelcome }: DashboardProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scopeTeamId = scopeTeam?.id ?? null;
  const { artifacts, setArtifacts, selectedId, pick, afterDelete, notice, dismissNotice, opened, held, urlSync } = useArtifactLink({ initialArtifacts, target: linkTarget, failed: linkFailed, onHandled: onLinkHandled, loadArtifact, list: listRef, detail: detailRef });
  const listFilters = useListFilters();
  const { query, setQuery, kind, setKind, view, setView, clearFilters } = listFilters;
  const { hidden: sidebarHidden, hide: hideSidebar, visibility } = useSidebarToggle(shellRef, sidebarRef);
  const fresh = useNewArtifact({ setArtifacts, setSelectedId: pick, clearFilters });
  useLinkLeavesNewArtifact(opened, fresh.leave);
  const sidebar = useDashboardProjects({ artifacts, setArtifacts, rows: projectRows, facets, api: projectsApi, teams, scopeTeam, tagFilter, listPath, viewerId });
  const entryKeys = useMemo(() => sidebar.projects.entries.map((entry) => entry.key), [sidebar.projects.entries]);
  const { counts, partial, filtered, groups, narrowed } = useWorkspaceList({ artifacts, filters: listFilters, projectFilter, tagFilter, teamId: scopeTeamId, teams, viewerId, entryKeys, totals: facets });

  const selected = pickSelected(artifacts, filtered, selectedId);
  useSelectionInUrl(selected, urlSync);
  const fullInHand = useMemo(() => withHeld(initialFull, held), [initialFull, held]);

  // An artifact Undo moved back: in the list again, first, and open.
  const comeBack = useCallback((artifact: ArtifactDto) => {
    setArtifacts((current) => listWithReturned(current, toArtifactListItem(artifact)));
    pick(artifact.id);
  }, [setArtifacts, pick]);
  // A saved artifact, in the list: a sharing change that moved it to another workspace takes it out at once (home-move-rules.ts).
  const { refresh } = fresh;
  const saved = useCallback((artifact: ArtifactDto) => {
    refresh(artifact);
    setArtifacts((current) => listAfterSave(current, toArtifactListItem(artifact), teams, scopeTeamId));
  }, [refresh, setArtifacts, teams, scopeTeamId]);
  const moves = useHomeMoves({ teams, scopeTeam, viewerId, listPath, onReturned: comeBack, onChanged: saved });

  // A save renders nothing on the server (updateArtifactAction); the workspace asks for itself once the saves go quiet.
  const { soon: refreshSoon } = useQuietRefresh(refreshAfterSaves);
  function updated(artifact: ArtifactDto) {
    moves.settle(artifact.id);
    saved(artifact);
    refreshSoon();
  }

  function deleted(id: string) {
    fresh.deleted(id);
    setArtifacts((current) => {
      const next = current.filter((artifact) => artifact.id !== id);
      afterDelete(id, next[0]?.id ?? "");
      return next;
    });
  }

  return (
    <ShareTeamsProvider teams={teams}>
      <WorkspaceHomeProvider home={moves.home}>
      <LinkedCommentsProvider link={opened} selectedPublicId={selected?.publicId ?? null}>
      <SidebarVisibilityProvider value={visibility}>
      {/* An app shell from md up: the frame is the viewport (workspace-frame), and only the sidebar's tree and the artifact scroll. */}
      <main data-app-shell className="flex min-h-[calc(100vh-3.5rem)] w-full max-w-none flex-col md:min-h-0 md:flex-1">
        <WorkspaceHeading scopeTeam={scopeTeam} ref={headingRef} />
        <LinkNoticeBar notice={notice} onDismiss={dismissNotice} />
        <TeamWelcome team={scopeTeam} initial={welcome} dismiss={dismissWelcome} focusAfter={headingRef} />

        <PanelSizesBeforePaint />
        <div ref={shellRef} className={cn("relative grid min-h-[640px] flex-1 bg-card md:min-h-0 md:grid-rows-[auto_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]", shellColumns(sidebarHidden))}>
          <WorkspaceSidebar
            sidebarRef={sidebarRef}
            listRef={listRef}
            hidden={sidebarHidden}
            onHide={hideSidebar}
            teams={teams}
            scopeTeam={scopeTeam}
            listPath={listPath}
            viewerId={viewerId}
            query={query}
            onQuery={setQuery}
            filters={{ kind, onKind: setKind, facets, projectFilter, tagFacets, tagFilter, scopeTeam, listPath }}
            onCreate={createIn(scopeTeam, fresh.start)}
            view={view}
            counts={counts}
            partialCounts={partial}
            onView={setView}
            sidebar={sidebar}
            projectFilter={projectFilter}
            groups={groups}
            narrowed={narrowed}
            selectedId={listSelection(fresh.session, selected)}
            onSelect={fresh.select}
            listState={artifactListState({ total: artifacts.length, shown: filtered.length })}
            onClearFilters={clearFilters}
          />
          {sidebarHidden ? null : <SidebarSplitter sidebar={sidebarRef} shell={shellRef} />}

          {/* `contents` keeps the pane a grid item; the ref lets a link bring it into view on phones. */}
          <div ref={detailRef} data-slot="workspace-detail" className="contents">
          <WorkspacePane
            fresh={fresh}
            api={newArtifactApi}
            project={filteredProjectName(projectFilter, facets)}
            selected={selected}
            viewerId={viewerId}
            origin={origin}
            onUpdated={updated}
            onDeleted={deleted}
            initialFull={fullInHand}
            loadArtifact={loadArtifact}
            returned={moves.returned}
            afterSave={refreshSoon}
          />
          </div>
        </div>
      </main>
      </SidebarVisibilityProvider>
      </LinkedCommentsProvider>
      </WorkspaceHomeProvider>
    </ShareTeamsProvider>
  );
}
