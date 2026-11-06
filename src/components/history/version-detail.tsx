"use client";

import { IconArrowBackUp, IconLoader2 } from "@tabler/icons-react";

import { ArtifactView } from "@/components/artifact-view/artifact-view";
import { EditDiff } from "@/components/teams/edit-diff";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { VersionDetailDto, VersionSummaryDto } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";
import { diffableContent } from "@/lib/versions/diff-text";

import { SavedAt } from "./last-edited";
import { saveKindLabel } from "./version-labels";
import { VersionAuthor } from "./version-list";

/** How the selected version is shown: rendered, or as changes. */
export type VersionView = "preview" | "current" | "previous";

/** The versions a view needs loaded: the selected one, plus what it is compared with. */
export function versionsNeeded(versions: readonly VersionSummaryDto[], id: string, view: VersionView): string[] {
  const index = versions.findIndex((version) => version.id === id);
  if (view === "current") return [id, versions[0]?.id ?? id];
  if (view === "previous") {
    const previous = versions[index + 1];
    return previous ? [id, previous.id] : [id];
  }
  return [id];
}

function comparable(detail: VersionDetailDto) {
  return { ...detail, content: diffableContent(detail.kind, detail.content) };
}

interface BodyProps {
  view: VersionView;
  selected: VersionDetailDto;
  compareWith: VersionDetailDto | null;
  compareId: string | null;
  files: readonly FileDto[];
}

function VersionBody({ view, selected, compareWith, compareId, files }: BodyProps) {
  if (view === "preview") return <ArtifactView kind={selected.kind} content={selected.content} title={selected.title} language={selected.language} files={files} />;
  if (compareId === null) return <p className="text-sm text-muted-foreground">This is the first saved version, so there is nothing before it.</p>;
  if (compareId === selected.id) return <p className="text-sm text-muted-foreground">This is the current version.</p>;
  if (!compareWith) return <Loading />;
  // Current: what changed since this version. Previous: what this version changed.
  const [before, after] = view === "current" ? [selected, compareWith] : [compareWith, selected];
  return <EditDiff before={comparable(before)} after={comparable(after)} />;
}

function Loading() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <IconLoader2 className="size-3.5 animate-spin" /> Loading version…
    </p>
  );
}

interface VersionDetailProps {
  version: VersionSummaryDto;
  versions: readonly VersionSummaryDto[];
  details: ReadonlyMap<string, VersionDetailDto>;
  error: string;
  view: VersionView;
  onView: (view: VersionView) => void;
  files: readonly FileDto[];
  restoring: boolean;
  onRestore: () => void;
}

/** One version: who saved it, a preview or a diff, and Restore for older versions. */
export function VersionDetail({ version, versions, details, error, view, onView, files, restoring, onRestore }: VersionDetailProps) {
  const selected = details.get(version.id);
  const needed = versionsNeeded(versions, version.id, view);
  const compareId = view === "preview" ? null : needed[1] ?? null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-5">
        <p className="min-w-0 text-sm">
          <VersionAuthor version={version} /> <span className="text-muted-foreground">· {saveKindLabel(version.saveKind)} · <SavedAt at={version.savedAt} /></span>
        </p>
        {version.latest ? null : (
          <Button size="sm" variant="outline" className="ml-auto" disabled={restoring} onClick={onRestore}>
            {restoring ? <IconLoader2 className="animate-spin" /> : <IconArrowBackUp />} Restore
          </Button>
        )}
      </div>
      <div className="border-b px-4 py-2 sm:px-5">
        <Tabs value={view} onValueChange={(value: VersionView) => { onView(value); }}>
          <TabsList aria-label="Show this version">
            <TabsTrigger value="preview" className="px-2.5">Preview</TabsTrigger>
            <TabsTrigger value="current" className="px-2.5">Compare with current</TabsTrigger>
            <TabsTrigger value="previous" className="px-2.5">Changes made</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {error ? <p role="alert" className="mb-3 text-sm text-destructive">{error}</p> : null}
        {selected ? (
          <VersionBody view={view} selected={selected} compareWith={compareId ? details.get(compareId) ?? null : null} compareId={compareId} files={files} />
        ) : (
          <Loading />
        )}
      </div>
    </div>
  );
}
