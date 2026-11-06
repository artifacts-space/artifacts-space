"use client";

import { IconLoader2, IconPencil } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { loadEditableArtifactAction } from "@/app/artifact/[publicId]/edit-actions";
import { VersionHistory } from "@/components/history/version-history";
import { Button } from "@/components/ui/button";
import type { ArtifactDto } from "@/lib/artifact-types";
import type { FileDto } from "@/lib/files/types";

import { PageEditor } from "./page-editor";

interface EditSurfaceProps {
  publicId: string;
  title: string;
  /** The latest save's time, for History's restore check. */
  updatedAt: string;
  /** Link and public artifacts: edits and restores may wait for approval. */
  reviewed: boolean;
  files: readonly FileDto[];
  /** The artifact as readers see it; hidden while editing. */
  children: React.ReactNode;
}

/**
 * Edit and History for people who may edit the artifact, around its read
 * view. The page renders this only for a signed-in editor; the editor loads
 * the latest saved copy itself, so nothing editable is ever part of a cached
 * page. Edit replaces the read view in place.
 */
export function EditSurface({ publicId, title, updatedAt, reviewed, files, children }: EditSurfaceProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<ArtifactDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  async function startEditing() {
    setLoading(true);
    try {
      const result = await loadEditableArtifactAction(publicId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setEditing(result.data);
    } catch {
      toast.error("Something went wrong. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function refresh() {
    startRefresh(() => { router.refresh(); });
  }

  if (editing) {
    return (
      <PageEditor
        artifact={editing}
        onClose={(saved) => {
          setEditing(null);
          if (saved) refresh();
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-end gap-1">
        {refreshing ? <IconLoader2 aria-label="Updating" className="mr-auto size-3.5 animate-spin text-muted-foreground" /> : null}
        <VersionHistory publicId={publicId} title={title} updatedAt={updatedAt} reviewed={reviewed} files={files} onRestored={refresh} />
        <Button variant="outline" size="sm" onClick={() => void startEditing()} disabled={loading}>
          {loading ? <IconLoader2 className="animate-spin" /> : <IconPencil />} Edit
        </Button>
      </div>
      {children}
    </div>
  );
}
