"use client";

import { IconLoader2, IconPlus, IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { ArtifactEditor } from "@/components/app/artifact-editor/artifact-editor";
import { artifactListState, filterArtifactList, type ArtifactListState } from "@/components/app/artifact-list-state";
import { CreateArtifactDialog } from "@/components/app/create-artifact-dialog";
import { ProjectFilter } from "@/components/app/project-filter";
import { TagFilter } from "@/components/app/tag-filter";
import { ScopeTabs } from "@/components/app/scope-tabs";
import { visibilityLabel } from "@/components/app/share-options";
import { ShareTeamsProvider, type ShareTeam } from "@/components/app/share-teams-context";
import { SharedArtifactPanel } from "@/components/app/shared-artifact-panel";
import { useEditAccess, useWithdrawSharing } from "@/components/app/use-edit-access";
import { useFullArtifact } from "@/components/app/use-full-artifact";
import { useServerSearch } from "@/components/app/use-server-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArtifactIcon } from "@/components/artifact-icon/artifact-icon";
import { LinkedCommentsProvider } from "@/components/comments/linked-comments";
import { ProjectLabel } from "@/components/projects/project-label";
import { withoutArtifactLink, type ArtifactLink } from "@/lib/app-link";
import { kinds } from "@/lib/artifact-kinds";
import { toArtifactListItem } from "@/lib/artifact-preview";
import type { ArtifactDto, ArtifactListItemDto } from "@/lib/artifact-types";
import type { ProjectFacets } from "@/lib/projects/queries";
import type { ProjectFilter as ProjectFilterValue } from "@/lib/projects/rules";
import type { TagFacet } from "@/lib/tags/queries";
import { rowTags } from "@/lib/tags/rules";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** What a list item says about sharing, or "" for a private artifact with nothing waiting. */
function sharingNote(artifact: ArtifactListItemDto) {
  if (artifact.pendingSharing) return " · Waiting for approval";
  return artifact.visibility === "private" ? "" : ` · ${visibilityLabel(artifact.visibility)}`;
}

function ArtifactListItem({ artifact, active, onSelect }: { artifact: ArtifactListItemDto; active: boolean; onSelect: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => { onSelect(artifact.id); }}
        aria-current={active ? "true" : undefined}
        className={cn(
          "w-full rounded-sm px-3 py-2.5 text-left transition-colors",
          active ? "bg-muted" : "hover:bg-muted/60",
        )}
      >
        <div className="flex items-start gap-2.5">
          <span className="flex h-6 w-4 shrink-0 items-center justify-center">
            <ArtifactIcon icon={artifact.icon} kind={artifact.kind} className={artifact.icon ? undefined : "size-3.5"} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-md font-medium">{artifact.title}</h2>
              <span className="shrink-0 text-xs text-muted-foreground">{dateFormat.format(new Date(artifact.updatedAt))}</span>
            </div>
            <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{artifact.summary || artifact.preview}</p>
            <p className="mt-1 flex min-w-0 items-center text-xs text-muted-foreground">
              {artifact.project ? <ProjectLabel name={artifact.project.name} icon={artifact.project.icon} /> : <span className="shrink-0">No project</span>}
              <span className="shrink-0 whitespace-pre">{sharingNote(artifact)}</span>
            </p>
            {artifact.tags.length > 0 ? <RowTags tags={artifact.tags} /> : null}
          </div>
        </div>
      </button>
    </li>
  );
}

/** A row's tags: the first two and how many more. */
function RowTags({ tags }: { tags: readonly string[] }) {
  const { visible, more } = rowTags(tags);
  return (
    <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      {visible.map((tag) => <span key={tag} className="truncate rounded-sm bg-muted px-1">{tag}</span>)}
      {more > 0 ? <span className="shrink-0">+{more}</span> : null}
    </p>
  );
}

interface ArtifactListProps {
  state: ArtifactListState;
  artifacts: ArtifactListItemDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearFilters: () => void;
}

/** The sidebar list. With no artifacts at all it stays quiet, because the main pane already offers to create one. */
function ArtifactList({ state, artifacts, selectedId, onSelect, onClearFilters }: ArtifactListProps) {
  if (state === "empty") {
    return <p className="px-4 py-10 text-center text-md text-muted-foreground">Nothing here yet.</p>;
  }
  if (state === "no-match") {
    return (
      <div className="px-4 py-10 text-center text-md text-muted-foreground">
        <p>No artifacts match.</p>
        <button type="button" onClick={onClearFilters} className="mt-2 underline underline-offset-4 hover:text-foreground">
          Clear filters
        </button>
      </div>
    );
  }
  return (
    <ul className="space-y-0.5">
      {artifacts.map((artifact) => (
        <ArtifactListItem key={artifact.id} artifact={artifact} active={selectedId === artifact.id} onSelect={onSelect} />
      ))}
    </ul>
  );
}

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

/** The editor for an artifact the viewer may edit, a read-only view for a teammate's, or the empty state. */
function DetailPane({ selected, viewerId, origin, onUpdated, onDeleted, onCreate, initialFull }: DetailPaneProps) {
  const { full, failure, remember, retry } = useFullArtifact(selected, initialFull);
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
  /** The project filter in the URL; the list is already filtered by it. */
  projectFilter: ProjectFilterValue | null;
  /** The tag filter's entries and counts for the whole scope. */
  tagFacets: TagFacet[];
  /** The tags in the URL; the list is already filtered by them. */
  tagFilter: string[];
  /** Full artifacts already in hand, so they open without a load (the /dev/workspace fixture). */
  initialFull?: readonly ArtifactDto[];
  /** The artifact the URL asked to open (`?artifact=<id>`), and whether to open its comments. */
  link?: ArtifactLink | null;
}

/** The artifact to select first: the linked one when it is in the list, else the first. */
function firstSelection(artifacts: ArtifactListItemDto[], link: ArtifactLink | null) {
  const linked = link ? artifacts.find((artifact) => artifact.publicId === link.publicId) : undefined;
  return linked?.id ?? artifacts[0]?.id ?? "";
}

/** Once the link has opened its artifact, drops it from the address bar so a reload or a later pick does not jump back. */
function useForgetArtifactLink(link: ArtifactLink | null) {
  useEffect(() => {
    if (!link) return;
    const { pathname, search, hash } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${withoutArtifactLink(search)}${hash}`);
  }, [link]);
}

export function Dashboard({ initialArtifacts, origin, viewerId, teams, scopeTeam, facets, projectFilter, tagFacets, tagFilter, initialFull, link = null }: DashboardProps) {
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [selectedId, setSelectedId] = useState(() => firstSelection(initialArtifacts, link));
  useForgetArtifactLink(link);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const serverMatches = useServerSearch(query, scopeTeam?.id ?? null, projectFilter, tagFilter);
  const filtered = useMemo(() => filterArtifactList(artifacts, { query, kind }, serverMatches), [artifacts, kind, query, serverMatches]);

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
      <LinkedCommentsProvider publicId={link?.comments ? link.publicId : null}>
      {/* An app shell from md up: the frame is the viewport (workspace-frame), and only the list and the artifact scroll. */}
      <main data-app-shell className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-none flex-col p-4 sm:p-6 md:min-h-0 md:flex-1">
        <ScopeTabs teams={teams} activeSlug={scopeTeam?.slug ?? null} />
        <DashboardHeading facets={facets} scopeTeam={scopeTeam} onCreate={() => { setCreateOpen(true); }} />

        {/* overflow-clip, not hidden: it rounds the corners without becoming a scroll box, so the artifact's toolbar can stick on phones. */}
        <div className="card-surface relative grid min-h-[640px] flex-1 overflow-clip md:min-h-0 md:grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
          <aside className="relative flex min-h-0 flex-col border-b bg-background/60 max-md:max-h-[360px] md:max-lg:max-h-[min(360px,32dvh)] lg:border-r lg:border-b-0">
            <div className="space-y-2 border-b p-3">
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
              <div className="grid grid-cols-2 gap-1">
                <Select value={kind} onValueChange={(value) => { setKind(value ?? "all"); }}>
                  <SelectTrigger size="sm" className="h-7 w-full min-w-0 border-0 bg-transparent px-1 text-sm text-muted-foreground shadow-none" aria-label="Filter by format">
                    <SelectValue>{(value: string) => (value === "all" ? "All formats" : value)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All formats</SelectItem>
                    {kinds.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
                <ProjectFilter facets={facets} filter={projectFilter} scopeTeam={scopeTeam} tags={tagFilter} />
              </div>
              <TagFilter facets={tagFacets} selected={tagFilter} projectFilter={projectFilter} scopeTeam={scopeTeam} />
            </div>
            <div data-slot="artifact-list" className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              <ArtifactList
                state={artifactListState({ total: artifacts.length, shown: filtered.length })}
                artifacts={filtered}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                onClearFilters={() => { setQuery(""); setKind("all"); }}
              />
            </div>
            <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
              {filtered.length} shown
            </div>
          </aside>

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
