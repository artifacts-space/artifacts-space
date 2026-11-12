"use client";

import { IconArrowLeft, IconHistory, IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog, useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ArtifactDto, VersionDetailDto, VersionSummaryDto } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";
import { restoreVersionAction } from "@/lib/versions/actions";
import { cn } from "@/lib/utils";

import { useVersionHistory } from "./use-version-history";
import { restoredMessage } from "./version-labels";
import { VersionDetail, versionsNeeded, type VersionView } from "./version-detail";
import { VersionList } from "./version-list";

export interface VersionHistoryProps {
  publicId: string;
  title: string;
  /** The artifact's updatedAt the person sees; a newer save by someone else refuses a restore. */
  updatedAt: string;
  /** Link and public artifacts: a restore waits for approval like any edit. */
  reviewed: boolean;
  files: readonly FileDto[];
  /** The editor has changes a restore would replace. */
  hasUnsavedChanges?: boolean;
  onRestored: (artifact: ArtifactDto) => void;
  className?: string;
  /** Draws its own way in, such as a menu item, in place of the History button. It gets the function that opens the dialog. */
  trigger?: (openHistory: () => void) => React.ReactNode;
}

/** Loading, error, and empty states above the version list. */
function ListStatus({ versions, error }: { versions: readonly VersionSummaryDto[] | null; error: string }) {
  if (error) return <p role="alert" className="p-4 text-sm text-destructive">{error}</p>;
  if (versions === null) {
    return <p role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><IconLoader2 className="size-3.5 animate-spin" /> Loading history…</p>;
  }
  if (versions.length === 0) return <p className="p-4 text-sm text-muted-foreground">No versions yet. The next save starts the history.</p>;
  return null;
}

/** Whether files were replaced since the selected version, so Restore leaves newer files in place. */
function hasReplacedFiles(details: ReadonlyMap<string, VersionDetailDto>, selected: VersionSummaryDto | null): boolean {
  if (!selected) return false;
  return (details.get(selected.id)?.replacedSince?.length ?? 0) > 0;
}

function restoreDescription(reviewed: boolean, hasUnsavedChanges: boolean, replacedFiles: boolean) {
  const parts = ["It becomes the current version as a new save. Every version stays in the history."];
  if (replacedFiles) parts.push("Replaced files stay as they are now. Download the older copies from this version.");
  if (reviewed) parts.push("If the team approves edits, readers outside the team keep the approved version until a team owner or admin approves this one.");
  if (hasUnsavedChanges) parts.push("Your unsaved changes in the editor are replaced.");
  return parts.join(" ");
}

/**
 * The History button and dialog for people who may edit an artifact: every
 * saved version with who saved it and when, a preview or diff of each, and
 * Restore, which files a new version and never rewrites history.
 */
export function VersionHistory({ publicId, title, updatedAt, reviewed, files, hasUnsavedChanges = false, onRestored, className, trigger }: VersionHistoryProps) {
  const history = useVersionHistory(publicId);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<VersionView>("preview");
  const [showDetail, setShowDetail] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const confirmRestore = useConfirm("restoreVersion");

  function show(versions: readonly VersionSummaryDto[], id: string, nextView: VersionView) {
    setSelectedId(id);
    setView(nextView);
    void history.loadDetails(versionsNeeded(versions, id, nextView));
  }

  async function openHistory() {
    setOpen(true);
    setShowDetail(false);
    const versions = await history.loadList();
    const first = versions?.[0];
    if (versions && first) show(versions, first.id, "preview");
  }

  async function restore(versionId: string) {
    setRestoring(true);
    try {
      const result = await restoreVersionAction(publicId, versionId, updatedAt);
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      toast.success(restoredMessage(result.data));
      onRestored(result.data.artifact);
      const versions = await history.loadList();
      const first = versions?.[0];
      if (versions && first) show(versions, first.id, "preview");
      return true;
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
      return false;
    } finally {
      setRestoring(false);
    }
  }

  const versions = history.versions ?? [];
  const selected = versions.find((version) => version.id === selectedId) ?? null;

  return (
    <>
      {trigger ? trigger(() => void openHistory()) : (
        <Button variant="ghost" size="sm" className={className} onClick={() => void openHistory()}>
          <IconHistory /> History
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(88dvh,820px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="border-b px-4 py-3 pr-12 sm:px-5">
            <DialogTitle className="truncate">History of {title}</DialogTitle>
            <DialogDescription>Every save is kept. Quick saves by one person within 2 minutes count as one version.</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1">
            <div className={cn("min-h-0 w-full overflow-y-auto overscroll-contain border-r lg:block lg:w-80 lg:shrink-0", showDetail ? "max-lg:hidden" : null)}>
              <ListStatus versions={history.versions} error={history.listError} />
              <VersionList versions={versions} selectedId={selectedId} onSelect={(id) => { show(versions, id, view); setShowDetail(true); }} />
            </div>
            <div className={cn("min-h-0 min-w-0 flex-1 flex-col", showDetail ? "flex" : "hidden lg:flex")}>
              <div className="border-b px-2 py-1.5 lg:hidden">
                <Button variant="ghost" size="sm" onClick={() => { setShowDetail(false); }}><IconArrowLeft /> All versions</Button>
              </div>
              {selected ? (
                <VersionDetail
                  version={selected}
                  versions={versions}
                  details={history.details}
                  error={history.detailError}
                  view={view}
                  onView={(next) => { show(versions, selected.id, next); }}
                  files={files}
                  restoring={restoring}
                  onRestore={() => { confirmRestore.request(() => restore(selected.id)); }}
                />
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        state={confirmRestore.dialog}
        title="Restore this version?"
        description={restoreDescription(reviewed, hasUnsavedChanges, hasReplacedFiles(history.details, selected))}
        confirmLabel="Restore"
        confirmVariant="default"
        pending={restoring}
      />
    </>
  );
}
